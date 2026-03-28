export const PRH_API_BASE_URL =
  "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";
export const USER_AGENT = "cli-agent-sandbox/1.0";
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_COMPANIES_TO_RETURN = 20;

/** Keyword patterns for detecting the language of a company name. */
export const LANGUAGE_KEYWORDS = {
  fi: [
    "oy",
    "oyj",
    "rahasto",
    "eläke",
    "säätiö",
    "osk",
    "osuuskunta",
    "sivukonttori",
    "ry",
    "sr",
    "keskinäinen",
    "vakuutusyhtiö",
  ],
  sv: [
    "ab",
    "abp",
    "stiftelse",
    "filial",
    "andelslag",
    "förening",
    "fond",
    "ömsesidigt",
    "försäkringsbolag",
  ],
  en: [
    "ltd",
    "plc",
    "fund",
    "foundation",
    "branch",
    "cooperative",
    "association",
    "mutual",
    "insurance",
  ],
} as const;
