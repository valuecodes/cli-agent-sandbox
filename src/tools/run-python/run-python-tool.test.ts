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

  it("executes a valid Python script", async () => {
    const scriptContent = 'print("Hello from Python")';
    await fs.writeFile(
      path.join(scriptsDir, "hello.py"),
      scriptContent,
      "utf8"
    );

    const tool = createRunPythonTool({ scriptsDir, logger: mockLogger });
    const resultJson = await invokeTool<string>(tool, {
      scriptName: "hello.py",
      input: "",
    });
    const result = JSON.parse(resultJson) as PythonResult;

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Hello from Python");
    expect(result.stderr).toBe("");
  });

  it("captures stderr from Python script", async () => {
    const scriptContent = `
import sys
sys.stderr.write("Error message")
sys.exit(1)
`;
    await fs.writeFile(
      path.join(scriptsDir, "error.py"),
      scriptContent,
      "utf8"
    );

    const tool = createRunPythonTool({ scriptsDir, logger: mockLogger });
    const resultJson = await invokeTool<string>(tool, {
      scriptName: "error.py",
      input: "",
    });
    const result = JSON.parse(resultJson) as PythonResult;

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Error message");
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

  it("passes JSON input via stdin", async () => {
    const scriptContent = `
import json
import sys
data = json.load(sys.stdin)
print(json.dumps({"received": data}))
`;
    await fs.writeFile(
      path.join(scriptsDir, "stdin_test.py"),
      scriptContent,
      "utf8"
    );

    const tool = createRunPythonTool({ scriptsDir, logger: mockLogger });
    const resultJson = await invokeTool<string>(tool, {
      scriptName: "stdin_test.py",
      input: '{"message":"hello","count":42}',
    });
    const result = JSON.parse(resultJson) as PythonResult;

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout.trim()) as {
      received: { message: string; count: number };
    };
    expect(output.received.message).toBe("hello");
    expect(output.received.count).toBe(42);
  });

  it("works with empty input string", async () => {
    const scriptContent = 'print("no stdin needed")';
    await fs.writeFile(
      path.join(scriptsDir, "no_stdin.py"),
      scriptContent,
      "utf8"
    );

    const tool = createRunPythonTool({ scriptsDir, logger: mockLogger });
    const resultJson = await invokeTool<string>(tool, {
      scriptName: "no_stdin.py",
      input: "",
    });
    const result = JSON.parse(resultJson) as PythonResult;

    expect(result.success).toBe(true);
    expect(result.stdout).toContain("no stdin needed");
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

  it("handles complex nested input objects", async () => {
    const scriptContent = `
import json
import sys
data = json.load(sys.stdin)
print(json.dumps({"features": data["feature_ids"], "seed": data["seed"]}))
`;
    await fs.writeFile(
      path.join(scriptsDir, "nested_input.py"),
      scriptContent,
      "utf8"
    );

    const tool = createRunPythonTool({ scriptsDir, logger: mockLogger });
    const resultJson = await invokeTool<string>(tool, {
      scriptName: "nested_input.py",
      input:
        '{"ticker":"SPY","feature_ids":["mom_1m","vol_3m","px_sma50"],"seed":42}',
    });
    const result = JSON.parse(resultJson) as PythonResult;

    expect(result.success).toBe(true);

    const output = JSON.parse(result.stdout.trim()) as {
      features: string[];
      seed: number;
    };
    expect(output.features).toEqual(["mom_1m", "vol_3m", "px_sma50"]);
    expect(output.seed).toBe(42);
  });
});
