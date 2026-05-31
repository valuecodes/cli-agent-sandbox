export const AGENT_NAME = "GrantsExplorerAgent";
export const AGENT_MODEL = "gpt-5-mini";
export const DEFAULT_PAATOKSET_DIR = "tmp/grants-explorer/paatokset";
export const MANIFEST_FILE = "sectors.json";
// Combined-dataset artifact: a single JSON array of every GrantRow, written
// to the parent of DEFAULT_PAATOKSET_DIR after every successful load. The
// per-sector xlsx files stay alongside for resume-after-failure semantics.
export const DEFAULT_COMBINED_GRANTS_FILE = "grants.json";
export const PAATOKSET_SOURCE_URL =
  "https://www.tutkihallintoa.fi/valtionavustukset/tutkiavustuksia/";
