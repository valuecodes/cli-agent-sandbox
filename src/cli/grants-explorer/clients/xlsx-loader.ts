import type { Logger } from "~clients/logger";
import XLSX from "xlsx";

import type { GrantRow, Sector } from "../types/schemas";
import { GrantRowSchema } from "../types/schemas";
import { extractBusinessId } from "../utils/business-id";

type RawCell = string | number | boolean | Date | null;
type RawRow = RawCell[];

// The xlsx package declares `SSF` as `any`; this typed wrapper avoids
// no-unsafe-call/member-access lint errors at every call site.
type ParsedDateCode = { y: number; m: number; d: number };
const parseExcelSerialDate = (serial: number): ParsedDateCode | undefined => {
  const ssf = XLSX.SSF as {
    parse_date_code: (n: number) => ParsedDateCode | undefined;
  };
  return ssf.parse_date_code(serial);
};

// Finnish column name (source xlsx header) → English GrantRow field.
// Order is irrelevant; we map by header text.
const HEADER_TO_FIELD: Record<string, keyof GrantRow> = {
  "Päätös pvm": "decision_date",
  "Saajan nimi": "recipient",
  Myöntäjä: "granting_authority",
  Asianumero: "case_number",
  Haettu: "amount_applied",
  Myönnetty: "amount_granted",
  "EU-varat": "has_eu_funding",
  "Hyväksytty käyttötarkoitus": "purpose",
  "Haun nimi (asianumero)": "programme",
  Alueet: "region",
};

/**
 * Normalize an Excel date-styled cell into ISO `YYYY-MM-DD`.
 *
 * `paatokset.xlsx` stores `Päätös pvm` as a raw Excel serial number (e.g. 46022)
 * with date styling, so `XLSX.read({ cellDates: true })` does NOT convert it to
 * a Date. We accept all three shapes for safety: Date (other producers), number
 * (this file), and pre-formatted string.
 */
export const normalizeExcelDate = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = parseExcelSerialDate(value);
    if (!parsed) {
      return null;
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

/**
 * Coerce a cell to an integer EUR amount, or `null` when missing/invalid.
 *
 * Returns `null` (NOT `0`, NOT row-skip) for invalid input. A missing or
 * malformed grant amount must remain distinguishable from a real `0 €`
 * decision in SUM/AVG aggregates.
 */
export const normalizeAmount = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
};

/**
 * In `paatokset.xlsx`, EU-funded rows hold a Wikipedia flag-image URL in the
 * EU-varat cell; unfunded rows are empty. Any non-empty trimmed string → 1.
 * Non-null primitive cells (number / boolean / Date) are also treated as
 * "present", since for this column any non-empty value indicates funding.
 */
export const normalizeEuFunding = (value: unknown): 0 | 1 => {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? 1 : 0;
  }
  return 1;
};

export const normalizeText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

export type XlsxLoaderOptions = {
  logger: Logger;
};

/**
 * Loads `paatokset.xlsx` into typed GrantRow records.
 *
 * Header mapping is by exact Finnish column name (see HEADER_TO_FIELD); column
 * order in the workbook does not matter. Unknown headers are ignored.
 */
export type LoadOptions = {
  // Sector tag attached to every row of the loaded xlsx. Required: each
  // per-sector xlsx must be loaded with the matching manifest entry so the
  // sektoriluokitus_code / _label columns in the DB carry traceable values.
  sector: Sector;
};

export class XlsxLoader {
  private logger: Logger;

  constructor({ logger }: XlsxLoaderOptions) {
    this.logger = logger;
  }

  load(filePath: string, options: LoadOptions): GrantRow[] {
    this.logger.debug("Reading xlsx file", { filePath });
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error(`No sheets found in ${filePath}`);
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" missing in ${filePath}`);
    }
    const rawRows = XLSX.utils.sheet_to_json<RawRow>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    if (rawRows.length === 0) {
      throw new Error(`No rows in sheet "${sheetName}" of ${filePath}`);
    }

    const headerRow = rawRows[0];
    if (!headerRow) {
      throw new Error(`Empty header row in ${filePath}`);
    }
    const columnIndex: Partial<Record<keyof GrantRow, number>> = {};
    headerRow.forEach((cell, idx) => {
      const headerText = typeof cell === "string" ? cell.trim() : "";
      const field = HEADER_TO_FIELD[headerText];
      if (field) {
        columnIndex[field] = idx;
      }
    });

    const missing = Object.entries(HEADER_TO_FIELD)
      .filter(([, field]) => columnIndex[field] === undefined)
      .map(([header]) => header);
    if (missing.length > 0) {
      throw new Error(
        `Missing expected columns in ${filePath}: ${missing.join(", ")}`
      );
    }

    const rows: GrantRow[] = [];
    let dateNormalizationFailures = 0;
    let validationFailures = 0;
    for (let i = 1; i < rawRows.length; i++) {
      const raw = rawRows[i];
      if (!raw) {
        continue;
      }

      const at = (field: keyof GrantRow): unknown => {
        const idx = columnIndex[field];
        return idx === undefined ? null : (raw[idx] ?? null);
      };

      const decisionDate = normalizeExcelDate(at("decision_date"));
      if (decisionDate === null && at("decision_date") !== null) {
        dateNormalizationFailures++;
        this.logger.warn("Failed to normalize Päätös pvm", {
          rowIndex: i,
          raw: at("decision_date"),
        });
      }

      // Normalize recipient once so the null-propagation chain (null cell →
      // null recipient → null business_id) is obvious and we don't trim twice.
      const recipient = normalizeText(at("recipient"));
      const candidate = {
        decision_date: decisionDate,
        recipient,
        recipient_business_id: extractBusinessId(recipient),
        granting_authority: normalizeText(at("granting_authority")),
        case_number: normalizeText(at("case_number")),
        amount_applied: normalizeAmount(at("amount_applied")),
        amount_granted: normalizeAmount(at("amount_granted")),
        has_eu_funding: normalizeEuFunding(at("has_eu_funding")),
        purpose: normalizeText(at("purpose")),
        programme: normalizeText(at("programme")),
        region: normalizeText(at("region")),
        sektoriluokitus_code: options.sector.code,
        sektoriluokitus_label: options.sector.label,
      };

      const parsed = GrantRowSchema.safeParse(candidate);
      if (!parsed.success) {
        validationFailures++;
        this.logger.warn("Row failed GrantRowSchema validation; skipping", {
          rowIndex: i,
          issues: parsed.error.issues,
        });
        continue;
      }
      rows.push(parsed.data);
    }

    if (validationFailures > 0) {
      this.logger.warn(
        "XlsxLoader produced rows that failed schema validation",
        {
          validationFailures,
          totalRawRows: rawRows.length - 1,
        }
      );
    }

    // Count loaded rows where the recipient string is present but no
    // y-tunnus could be extracted (private persons, foreign entities,
    // working groups). Surfacing this in the loader summary makes silent
    // source-format drift visible — e.g. if a future export starts placing
    // y-tunnus somewhere other than the trailing parenthetical.
    const recipientsWithoutBusinessId = rows.filter(
      (r) => r.recipient !== null && r.recipient_business_id === null
    ).length;

    this.logger.info("Loaded xlsx rows", {
      filePath,
      sektoriluokitusCode: options.sector.code,
      rowCount: rows.length,
      dateNormalizationFailures,
      validationFailures,
      recipientsWithoutBusinessId,
    });
    return rows;
  }
}
