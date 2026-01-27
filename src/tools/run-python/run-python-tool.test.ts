import fs from "node:fs/promises";
import path from "node:path";
import { TMP_ROOT } from "~tools/utils/fs";
import { invokeTool } from "~tools/utils/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PythonResult } from "./run-python-tool";
import { createRunPythonTool, isValidScriptName } from "./run-python-tool";

describe("isValidScriptName", () => {
  it("accepts valid script names", () => {
    expect(isValidScriptName("hello.py")).toBe(true);
    expect(isValidScriptName("my_script.py")).toBe(true);
    expect(isValidScriptName("test-script.py")).toBe(true);
    expect(isValidScriptName("Script123.py")).toBe(true);
  });

  it("rejects non-.py extensions", () => {
    expect(isValidScriptName("hello.js")).toBe(false);
    expect(isValidScriptName("hello.txt")).toBe(false);
    expect(isValidScriptName("hello")).toBe(false);
    expect(isValidScriptName("hello.py.txt")).toBe(false);
  });

  it("rejects path separators", () => {
    expect(isValidScriptName("subdir/hello.py")).toBe(false);
    expect(isValidScriptName("../hello.py")).toBe(false);
    expect(isValidScriptName("subdir\\hello.py")).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(isValidScriptName("..hello.py")).toBe(false);
    expect(isValidScriptName("hello..py")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isValidScriptName("hello world.py")).toBe(false);
    expect(isValidScriptName("hello@script.py")).toBe(false);
    expect(isValidScriptName("hello$script.py")).toBe(false);
  });
});

describe("createRunPythonTool", () => {
  let testDir = "";
  let scriptsDir = "";
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const mockLogger = { tool: () => {} } as never;

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true });
    testDir = await fs.mkdtemp(path.join(TMP_ROOT, "vitest-python-"));
    scriptsDir = path.join(testDir, "scripts");
    await fs.mkdir(scriptsDir, { recursive: true });
  });

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
    testDir = "";
    scriptsDir = "";
  });

  it("rejects invalid script names", async () => {
    const tool = createRunPythonTool({ scriptsDir, logger: mockLogger });
    const resultJson = await invokeTool<string>(tool, {
      scriptName: "../etc/passwd",
      input: "",
    });
    const result = JSON.parse(resultJson) as PythonResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid script name");
  });

  it("handles non-existent scripts", async () => {
    const tool = createRunPythonTool({ scriptsDir, logger: mockLogger });
    const resultJson = await invokeTool<string>(tool, {
      scriptName: "nonexistent.py",
      input: "",
    });
    const result = JSON.parse(resultJson) as PythonResult;

    expect(result.success).toBe(false);
    // Python exits with non-zero code when script doesn't exist
    expect(result.exitCode).not.toBe(0);
  });

  it("calls logger when provided", async () => {
    const scriptContent = 'print("test")';
    await fs.writeFile(path.join(scriptsDir, "test.py"), scriptContent, "utf8");

    const loggedMessages: string[] = [];
    const mockLogger = {
      tool: (msg: string) => loggedMessages.push(msg),
    };

    const tool = createRunPythonTool({
      scriptsDir,
      logger: mockLogger as never,
    });
    await invokeTool<string>(tool, { scriptName: "test.py", input: "" });

    expect(loggedMessages.length).toBe(2);
    expect(loggedMessages[0]).toContain("Running Python script");
    expect(loggedMessages[1]).toContain("Python result");
  });

  it("handles invalid JSON input", async () => {
    const tool = createRunPythonTool({ scriptsDir, logger: mockLogger });
    const resultJson = await invokeTool<string>(tool, {
      scriptName: "any.py",
      input: "not valid json",
    });
    const result = JSON.parse(resultJson) as PythonResult;

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid JSON in input parameter");
  });
});
