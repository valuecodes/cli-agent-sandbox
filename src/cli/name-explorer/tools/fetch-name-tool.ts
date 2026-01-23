import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@openai/agents";
import { JSDOM } from "jsdom";
import { z } from "zod";

import { resolveAndValidateUrl } from "../../../tools/utils/url-safety";

/**
 * Statistics for a single decade row
 */
export type NameStatRow = {
  decade: string;
  men: number | null;
  women: number | null;
  total: number | null;
  menUnder5?: boolean;
  womenUnder5?: boolean;
  totalUnder5?: boolean;
};

/**
 * Complete result from fetching name statistics
 */
export type NameStatResult = {
  name: string;
  rows: NameStatRow[];
  totals: {
    men: number | null;
    women: number | null;
    total: number | null;
    menUnder5?: boolean;
    womenUnder5?: boolean;
    totalUnder5?: boolean;
  };
  fetchedAt: string;
};

/**
 * Error result when fetch fails
 */
export type NameStatError = {
  error: string;
  name: string;
};

type ParsedValue = {
  value: number | null;
  isUnder5: boolean;
};

const DVV_BASE_URL = "https://nimipalvelu.dvv.fi/etunimihaku";
const USER_AGENT = "cli-agent-sandbox/1.0";
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Parse a table cell value from the DVV name statistics page.
 * Handles:
 * - &nbsp; as thousand separator (e.g., "6 820" -> 6820)
 * - "alle X" (under X, privacy-protected) -> returns null with flag
 * - "0" -> 0
 */
const parseTableValue = (rawValue: string): ParsedValue => {
  const trimmed = rawValue.trim();

  // Handle "alle X" (Finnish for "under X") - privacy protection for small counts
  const alleMatch = /^alle\s*(\d+)/i.exec(trimmed);
  if (alleMatch) {
    return { value: null, isUnder5: true };
  }

  // Handle "0" explicitly
  if (trimmed === "0") {
    return { value: 0, isUnder5: false };
  }

  // Handle empty or dash
  if (trimmed === "" || trimmed === "-" || trimmed === "–") {
    return { value: 0, isUnder5: false };
  }

  // Remove &nbsp; (non-breaking space, char code 160) and regular spaces used as thousand separators
  const cleaned = trimmed
    .replace(/\u00A0/g, "") // &nbsp;
    .replace(/\s/g, ""); // regular whitespace

  const parsed = parseInt(cleaned, 10);

  if (isNaN(parsed)) {
    return { value: null, isUnder5: false };
  }

  return { value: parsed, isUnder5: false };
};

/**
 * Parse a single table row into a NameStatRow
 */
const parseTableRow = (cells: Element[]): NameStatRow | null => {
  const [decadeCell, menCell, womenCell, totalCell] = cells;
  if (!decadeCell || !menCell || !womenCell || !totalCell) {
    return null;
  }

  const decade = decadeCell.textContent.trim();
  const menParsed = parseTableValue(menCell.textContent);
  const womenParsed = parseTableValue(womenCell.textContent);
  const totalParsed = parseTableValue(totalCell.textContent);

  const row: NameStatRow = {
    decade,
    men: menParsed.value,
    women: womenParsed.value,
    total: totalParsed.value,
  };

  if (menParsed.isUnder5) {
    row.menUnder5 = true;
  }
  if (womenParsed.isUnder5) {
    row.womenUnder5 = true;
  }
  if (totalParsed.isUnder5) {
    row.totalUnder5 = true;
  }

  return row;
};

/**
 * Extract name statistics from the DVV HTML page
 */
const extractNameStatistics = (
  html: string,
  name: string
): NameStatResult | NameStatError => {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Find the statistics table by looking for Finnish headers
  const tables = document.querySelectorAll("table");

  let statsTable: Element | null = null;

  for (const table of tables) {
    const headers = table.querySelectorAll("th");
    const headerTexts = Array.from(headers).map((h) =>
      h.textContent.toLowerCase()
    );

    // Look for the table with expected Finnish headers
    if (
      headerTexts.some((h) => h.includes("syntymä") || h.includes("vuodet")) &&
      headerTexts.some((h) => h.includes("miehiä") || h.includes("miehi")) &&
      headerTexts.some((h) => h.includes("naisia")) &&
      headerTexts.some((h) => h.includes("yhteensä"))
    ) {
      statsTable = table;
      break;
    }
  }

  if (!statsTable) {
    return {
      error:
        "Could not find statistics table on page. The name may not exist in the registry.",
      name,
    };
  }

  // Extract body rows (decade data)
  const tbody = statsTable.querySelector("tbody");
  const bodyRows = tbody
    ? Array.from(tbody.querySelectorAll("tr"))
    : Array.from(statsTable.querySelectorAll("tr")).slice(1);

  const rows: NameStatRow[] = [];

  for (const tr of bodyRows) {
    const cells = Array.from(tr.querySelectorAll("td"));
    const row = parseTableRow(cells);
    if (row?.decade) {
      rows.push(row);
    }
  }

  // Extract footer row (totals)
  const tfoot = statsTable.querySelector("tfoot");
  let totals: NameStatResult["totals"] = {
    men: null,
    women: null,
    total: null,
  };

  if (tfoot) {
    const footerCells = Array.from(tfoot.querySelectorAll("td, th"));
    const [, menCell, womenCell, totalCell] = footerCells;
    if (menCell && womenCell && totalCell) {
      const menParsed = parseTableValue(menCell.textContent);
      const womenParsed = parseTableValue(womenCell.textContent);
      const totalParsed = parseTableValue(totalCell.textContent);

      totals = {
        men: menParsed.value,
        women: womenParsed.value,
        total: totalParsed.value,
      };

      if (menParsed.isUnder5) {
        totals.menUnder5 = true;
      }
      if (womenParsed.isUnder5) {
        totals.womenUnder5 = true;
      }
      if (totalParsed.isUnder5) {
        totals.totalUnder5 = true;
      }
    }
  }

  return {
    name,
    rows,
    totals,
    fetchedAt: new Date().toISOString(),
  };
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export type FetchNameToolOptions = {
  cacheDir: string;
  refetch?: boolean;
  maxRequests?: number;
};

/**
 * Create a tool for fetching individual name statistics from DVV
 */
export const createFetchNameTool = (options: FetchNameToolOptions) => {
  const { cacheDir, refetch = false, maxRequests = 3 } = options;

  let requestCount = 0;

  return tool({
    name: "fetch_name_statistics",
    description: `Fetch Finnish first name (etunimi) statistics from DVV (Digital and Population Data Services Agency).
Returns decade-by-decade counts of how many men and women have been given the specified name.

Data includes:
- Decade ranges from pre-1899 to present (e.g., "–1899", "1900–1909", "2020–2026")
- Counts for men (Miehiä) and women (Naisia)
- Total count (Yhteensä)
- Values under 5 are marked as "alle 5" for privacy (returned as null with under5 flag)

Use this tool when the user wants to look up statistics for a specific individual name.
For aggregate statistics across top 100 names per decade, use the SQL database tools instead.`,
    parameters: z.object({
      name: z
        .string()
        .min(1)
        .describe("The Finnish first name to look up (e.g., 'Matti', 'Emma')"),
    }),
    execute: async ({ name }: { name: string }) => {
      const normalizedName = name.trim();

      if (!normalizedName) {
        return JSON.stringify({ error: "Name cannot be empty", name });
      }

      // Check cache first
      await fs.mkdir(cacheDir, { recursive: true });
      const cacheFile = path.join(
        cacheDir,
        `${normalizedName.toLowerCase()}.json`
      );

      if (!refetch && (await fileExists(cacheFile))) {
        const cached = await fs.readFile(cacheFile, "utf-8");
        return cached;
      }

      // Check request limit (only for actual fetches, not cache hits)
      if (requestCount >= maxRequests) {
        return JSON.stringify({
          error: `Request limit reached (max ${maxRequests} requests per session). Try asking about cached names or use the SQL database tools instead.`,
          name: normalizedName,
        });
      }
      requestCount++;

      // Build URL
      const url = `${DVV_BASE_URL}?nimi=${encodeURIComponent(normalizedName)}`;

      // SSRF validation
      const validation = await resolveAndValidateUrl(url);
      if (!validation.valid) {
        return JSON.stringify({
          error: `URL validation failed: ${validation.error}`,
          name: normalizedName,
        });
      }

      // Fetch the page
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, DEFAULT_TIMEOUT_MS);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "fi,en;q=0.9",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return JSON.stringify({
            error: `HTTP error: ${response.status} ${response.statusText}`,
            name: normalizedName,
          });
        }

        const html = await response.text();

        // Extract statistics from HTML
        const result = extractNameStatistics(html, normalizedName);

        // Cache the result
        const resultJson = JSON.stringify(result, null, 2);
        await fs.writeFile(cacheFile, resultJson);

        return resultJson;
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            return JSON.stringify({
              error: "Request timed out",
              name: normalizedName,
            });
          }
          return JSON.stringify({
            error: `Fetch error: ${error.message}`,
            name: normalizedName,
          });
        }
        return JSON.stringify({
          error: "Unknown error occurred",
          name: normalizedName,
        });
      }
    },
  });
};
