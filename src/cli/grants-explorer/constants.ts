const AGENT_NAME = "GrantsExplorerAgent";
const AGENT_MODEL = "gpt-5-mini";
const DEFAULT_PAATOKSET_DIR = "tmp/grants-explorer/paatokset";
const MANIFEST_FILE = "sectors.json";
// Combined-dataset artifact: a single JSON array of every GrantRow, written
// to the parent of DEFAULT_PAATOKSET_DIR after every successful load. The
// per-sector xlsx files stay alongside for resume-after-failure semantics.
const DEFAULT_COMBINED_GRANTS_FILE = "grants.json";
const PAATOKSET_SOURCE_URL =
  "https://www.tutkihallintoa.fi/valtionavustukset/tutkiavustuksia/";

export {
  AGENT_MODEL,
  AGENT_NAME,
  DEFAULT_COMBINED_GRANTS_FILE,
  DEFAULT_PAATOKSET_DIR,
  MANIFEST_FILE,
  PAATOKSET_SOURCE_URL,
};
