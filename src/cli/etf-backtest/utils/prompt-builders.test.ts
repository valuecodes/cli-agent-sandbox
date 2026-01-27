import { describe, expect, it } from "vitest";

import { buildRecoveryPrompt, buildRunPythonUsage } from "./prompt-builders";

describe("buildRunPythonUsage", () => {
  it("includes seed and dataPath in the tool input", () => {
    const result = buildRunPythonUsage({
      seed: 7,
      dataPath: "tmp/etf-backtest/data.json",
    });

    expect(result).toContain('"seed": 7');
    expect(result).toContain('"dataPath": "tmp/etf-backtest/data.json"');
    expect(result).toContain('scriptName: "run_experiment.py"');
  });
});

describe("buildRecoveryPrompt", () => {
  it("appends runPython usage after the message", () => {
    const message = "Recovery message.";
    const result = buildRecoveryPrompt(message, {
      seed: 1,
      dataPath: "data.json",
    });

    expect(result.startsWith(message)).toBe(true);
    expect(result).toContain("Use runPython with:");
    expect(result).toContain('"seed": 1');
    expect(result).toContain('"dataPath": "data.json"');
  });
});
