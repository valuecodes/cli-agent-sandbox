import { Logger } from "~clients/logger";
import { describe, expect, it, vi } from "vitest";

import type { EvalSuite } from "../types/schemas";
import { EvalRunner } from "./eval-runner";

// Mock AgentRunner and tool registry to avoid real agent calls
vi.mock("~clients/agent-runner", () => ({
  AgentRunner: vi.fn(function MockAgentRunner() {
    return {
      run: vi.fn().mockResolvedValue({ finalOutput: "mock output" }),
    };
  }),
}));

vi.mock("./tool-registry", () => ({
  createToolsFromNames: vi.fn().mockReturnValue([]),
}));

const createTestSuite = (overrides: Partial<EvalSuite> = {}): EvalSuite => ({
  name: "test-suite",
  version: "1.0.0",
  agent: {
    name: "TestAgent",
    model: "gpt-5-mini",
    instructions: "You are a test agent",
    tools: [],
  },
  cases: [
    {
      id: "case-1",
      name: "Simple test",
      prompt: "Say hello",
      assertions: [],
      tags: [],
    },
  ],
  ...overrides,
});

describe("EvalRunner", () => {
  const logger = new Logger({ level: "error" });

  describe("runSuiteWithModel", () => {
    it("overrides the suite model", async () => {
      const { AgentRunner } = await import("~clients/agent-runner");
      const runner = new EvalRunner({ logger });

      const suite = createTestSuite();
      await runner.runSuiteWithModel({ suite, model: "gpt-4.1-nano" });

      // AgentRunner should have been called with the overridden model
      expect(AgentRunner).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4.1-nano" })
      );
    });

    it("preserves other suite config when overriding model", async () => {
      const { AgentRunner } = await import("~clients/agent-runner");
      const runner = new EvalRunner({ logger });

      const suite = createTestSuite({
        agent: {
          name: "CustomAgent",
          model: "gpt-5-mini",
          instructions: "Custom instructions",
          tools: [],
          maxTurns: 3,
        },
      });

      await runner.runSuiteWithModel({ suite, model: "gpt-4.1-mini" });

      expect(AgentRunner).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "CustomAgent",
          model: "gpt-4.1-mini",
          instructions: "Custom instructions",
        })
      );
    });

    it("does not mutate the original suite", async () => {
      const runner = new EvalRunner({ logger });

      const suite = createTestSuite();
      await runner.runSuiteWithModel({ suite, model: "gpt-4.1-nano" });

      expect(suite.agent.model).toBe("gpt-5-mini");
    });

    it("returns a SuiteResult", async () => {
      const runner = new EvalRunner({ logger });

      const suite = createTestSuite();
      const result = await runner.runSuiteWithModel({
        suite,
        model: "gpt-4.1-nano",
      });

      expect(result.suiteName).toBe("test-suite");
      expect(result.suiteVersion).toBe("1.0.0");
      expect(result.summary).toBeDefined();
      expect(result.cases).toHaveLength(1);
    });
  });
});
