import { homedir } from "node:os";
import { join } from "node:path";

// Default log paths
const CLAUDE_PROJECTS_PATH = join(homedir(), ".claude", "projects");
const CODEX_SESSIONS_PATH = join(
  process.env.CODEX_HOME ?? join(homedir(), ".codex"),
  "sessions"
);

// Duration mappings (string to milliseconds)
const DURATION_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

// Provider names
const PROVIDER_CLAUDE = "claude" as const;
const PROVIDER_CODEX = "codex" as const;

export {
  CLAUDE_PROJECTS_PATH,
  CODEX_SESSIONS_PATH,
  DURATION_MS,
  PROVIDER_CLAUDE,
  PROVIDER_CODEX,
};
