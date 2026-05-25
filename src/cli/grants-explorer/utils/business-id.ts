// Finnish Business ID (y-tunnus): exactly 7 digits, hyphen, 1 check digit.
// In paatokset.xlsx it appears as a trailing parenthetical suffix on the
// Saajan nimi column, e.g. "Suomen elokuvasäätiö sr (0202113-9)".
//
// End-anchored on purpose: only the trailing form is canonical. Mid-string
// matches would risk false positives if any future cell text contains a
// digit-hyphen-digit run, and missing values for those rows are surfaced via
// the loader's unmatched-count log rather than guessed at.
const Y_TUNNUS_TRAILING = /\((\d{7}-\d)\)\s*$/;

export const extractBusinessId = (recipient: string | null): string | null => {
  if (!recipient) {
    return null;
  }
  return Y_TUNNUS_TRAILING.exec(recipient)?.[1] ?? null;
};
