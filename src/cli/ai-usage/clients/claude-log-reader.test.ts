import fs from "node:fs/promises";
import path from "node:path";
import { TMP_ROOT } from "~tools/utils/fs";
import { afterEach, describe, expect, it } from "vitest";

import { ClaudeLogReader } from "./claude-log-reader";

const mockLogger = {
  debug: () => {
    /* empty */
  },
} as never;

const encodeRepoPath = (repoPath: string) =>
  repoPath.replace(/\\/g, "/").replace(/\//g, "-");

const since = new Date("2024-01-01T00:00:00.000Z");
const repoPath = "/repo";

const buildEntry = (overrides: Record<string, unknown> = {}) => ({
  type: "assistant",
  timestamp: "2025-01-01T00:00:00.000Z",
  message: {
    model: "claude-3",
    usage: {
      input_tokens: 1,
      output_tokens: 2,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  },
  ...overrides,
});

const writeLogFile = async (lines: unknown[]) => {
  await fs.mkdir(TMP_ROOT, { recursive: true });
  const baseDir = await fs.mkdtemp(path.join(TMP_ROOT, "vitest-claude-"));
  const projectDir = path.join(baseDir, encodeRepoPath(repoPath));
  await fs.mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, "session.jsonl");
  const content = lines.map((line) => JSON.stringify(line)).join("\n");
  await fs.writeFile(filePath, content, "utf8");
  return baseDir;
};

describe("ClaudeLogReader cwd filtering", () => {
  let baseDir = "";

  afterEach(async () => {
    if (baseDir) {
      await fs.rm(baseDir, { recursive: true, force: true });
      baseDir = "";
    }
  });

  it("skips entries missing cwd", async () => {
    baseDir = await writeLogFile([buildEntry()]);
    const reader = new ClaudeLogReader({
      logger: mockLogger,
      basePath: baseDir,
    });
    const records = await reader.getUsage({ since, repoPath });
    expect(records).toHaveLength(0);
  });

  it("skips entries with mismatched cwd", async () => {
    baseDir = await writeLogFile([buildEntry({ cwd: "/other" })]);
    const reader = new ClaudeLogReader({
      logger: mockLogger,
      basePath: baseDir,
    });
    const records = await reader.getUsage({ since, repoPath });
    expect(records).toHaveLength(0);
  });

  it("keeps entries with matching cwd", async () => {
    baseDir = await writeLogFile([buildEntry({ cwd: "/repo/project" })]);
    const reader = new ClaudeLogReader({
      logger: mockLogger,
      basePath: baseDir,
    });
    const records = await reader.getUsage({ since, repoPath });
    expect(records).toHaveLength(1);
    expect(records[0]?.inputTokens).toBe(1);
  });
});
