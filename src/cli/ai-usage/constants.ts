import { homedir } from "os";
import { join } from "path";

// Default log paths
export const CLAUDE_PROJECTS_PATH = join(homedir(), ".claude", "projects");
export const CODEX_SESSIONS_PATH = join(
  process.env.CODEX_HOME ?? join(homedir(), ".codex"),
  "sessions"
);

// Duration mappings (string to milliseconds)
export const DURATION_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

// Provider names
export const PROVIDER_CLAUDE = "claude" as const;
export const PROVIDER_CODEX = "codex" as const;
