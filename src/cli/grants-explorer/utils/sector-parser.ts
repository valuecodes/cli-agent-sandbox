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

export const BLANK_LABEL = "(Tyhjä)";
export const BLANK_CODE = "BLANK";
export const MISSING_LABEL = "Sektoriluokitus puuttuu";
export const MISSING_CODE = "PUUTTUU";

/**
 * Parse one slicer option's text into a Sector, or return null when the text
 * isn't a selectable sektoriluokitus option (e.g. the "Valitse kaikki"
 * select-all control, or any focused element discovery happens to read that
 * isn't an option row). Returning null — rather than throwing — lets the
 * discovery walk skip noise without aborting.
 */
export const parseSectorOption = (raw: string): Sector | null => {
  const trimmed = raw.trim();
  if (trimmed === BLANK_LABEL) {
    return { code: BLANK_CODE, label: BLANK_LABEL };
  }
  if (trimmed === MISSING_LABEL) {
    return { code: MISSING_CODE, label: MISSING_LABEL };
  }
  const match = SECTOR_CODE.exec(trimmed);
  if (match?.[1] && match[2]) {
    return { code: match[1], label: match[2].trim() };
  }
  return null;
};
