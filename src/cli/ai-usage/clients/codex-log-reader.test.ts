import fs from "node:fs/promises";
import path from "node:path";
import { Logger } from "~clients/logger";
import { TMP_ROOT } from "~tools/utils/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CodexLogReader } from "./codex-log-reader";

describe("CodexLogReader findLogFiles", () => {
  let testDir = "";

  const logger = new Logger({
    level: "error",
    useColors: false,
    useTimestamps: false,
  });

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true });
    testDir = await fs.mkdtemp(path.join(TMP_ROOT, "codex-log-reader-"));
  });

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
    testDir = "";
  });

  it("includes non-zero-padded dates and skips invalid date directories", async () => {
    const validDir = path.join(testDir, "2024", "1", "5");
    await fs.mkdir(validDir, { recursive: true });
    const validFile = path.join(validDir, "session.jsonl");
    await fs.writeFile(validFile, "");

    const invalidMonthDir = path.join(testDir, "2024", "13", "1");
    await fs.mkdir(invalidMonthDir, { recursive: true });
    const invalidMonthFile = path.join(invalidMonthDir, "bad.jsonl");
    await fs.writeFile(invalidMonthFile, "");

    const invalidDayDir = path.join(testDir, "2024", "2", "31");
    await fs.mkdir(invalidDayDir, { recursive: true });
    const invalidDayFile = path.join(invalidDayDir, "bad.jsonl");
    await fs.writeFile(invalidDayFile, "");

    const invalidYearDir = path.join(testDir, "not-a-year", "1", "1");
    await fs.mkdir(invalidYearDir, { recursive: true });
    const invalidYearFile = path.join(invalidYearDir, "bad.jsonl");
    await fs.writeFile(invalidYearFile, "");

    const reader = new CodexLogReader({
      logger,
      basePath: testDir,
      debug: false,
    });

    const files = await reader.findLogFiles(new Date(2024, 0, 1));

    expect(files).toContain(validFile);
    expect(files).not.toContain(invalidMonthFile);
    expect(files).not.toContain(invalidDayFile);
    expect(files).not.toContain(invalidYearFile);
  });
});

describe("CodexLogReader parseSession repo filtering", () => {
  let testDir = "";

  const logger = new Logger({
    level: "error",
    useColors: false,
    useTimestamps: false,
  });

  const writeSessionFile = async (lines: unknown[]) => {
    await fs.mkdir(TMP_ROOT, { recursive: true });
    testDir = await fs.mkdtemp(path.join(TMP_ROOT, "codex-log-reader-"));
    const filePath = path.join(testDir, "session.jsonl");
    const content = lines.map((line) => JSON.stringify(line)).join("\n");
    await fs.writeFile(filePath, content, "utf8");
    return filePath;
  };

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
    testDir = "";
  });

  it("skips token_count entries when cwd is missing", async () => {
    const turnContext = {
      type: "turn_context",
      timestamp: "2025-01-01T00:00:00.500Z",
      payload: { model: "gpt-4.1" },
    };
    const event = {
      type: "event_msg",
      timestamp: "2025-01-01T00:00:01.000Z",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: 3,
            output_tokens: 2,
            cached_input_tokens: 0,
          },
        },
      },
    };

    const filePath = await writeSessionFile([turnContext, event]);
    const reader = new CodexLogReader({ logger });
    const records = await reader.parseSession(
      filePath,
      "/repo",
      new Date("2024-01-01T00:00:00.000Z")
    );

    expect(records).toHaveLength(0);
  });
});
