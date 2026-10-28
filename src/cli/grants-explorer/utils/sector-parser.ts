import type { Sector } from "../types/schemas";

// Slicer options come in three shapes:
//  1. A coded sector: "<code> <label>", e.g. "S131311 Kunnat". The code is S
//     followed by 1–6 digits (top-level S2..S15 and deep sub-codes like
//     S131311). Whitespace between code and label may be a regular or
//     non-breaking space.
//  2. The blank bucket "(Tyhjä)" — rows whose sektoriluokitus column is null.
//  3. The explicit "Sektoriluokitus puuttuu" bucket — rows the source tags as
//     sector-missing.
// We map (2) and (3) to sentinel codes so they get a NOT-NULL, queryable code
// in the DB while staying visually distinct from real S-codes.
const SECTOR_CODE = /^(S\d{1,6})\s+(.+)$/;

const BLANK_LABEL = "(Tyhjä)";
const BLANK_CODE = "BLANK";
const MISSING_LABEL = "Sektoriluokitus puuttuu";
const MISSING_CODE = "PUUTTUU";

/**
 * Parse one slicer option's text into a Sector, or return null when the text
 * isn't a selectable sektoriluokitus option (e.g. the "Valitse kaikki"
 * select-all control, or any focused element discovery happens to read that
 * isn't an option row). Returning null — rather than throwing — lets the
 * discovery walk skip noise without aborting.
 */
const parseSectorOption = (raw: string): Sector | null => {
  const trimmed = raw.trim();
  if (trimmed === BLANK_LABEL) {
    return { code: BLANK_CODE, label: BLANK_LABEL };
  }
  if (trimmed === MISSING_LABEL) {
    return { code: MISSING_CODE, label: MISSING_LABEL };
  }
  const match = SECTOR_CODE.exec(trimmed);
  const code = match?.[1];
  const label = match?.[2];
  if (
    code !== undefined &&
    code !== "" &&
    label !== undefined &&
    label !== ""
  ) {
    return { code, label: label.trim() };
  }
  return null;
};

export {
  BLANK_CODE,
  BLANK_LABEL,
  MISSING_CODE,
  MISSING_LABEL,
  parseSectorOption,
};
