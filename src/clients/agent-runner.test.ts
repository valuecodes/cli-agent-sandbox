import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Import after mocking
import { AgentRunner } from "./agent-runner";
import { Logger } from "./logger";

type EventHandler = (...args: unknown[]) => void;

// Store instances for test access
let mockRunnerInstance: {
  on: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};
let mockSessionInstance: object;
let eventHandlers: Map<string, EventHandler>;

vi.mock("@openai/agents", () => {
  // Create fresh mocks that will be configured in beforeEach
  return {
    Agent: vi.fn(function MockAgent() {
      return {};
    }),
    Runner: vi.fn(function MockRunner() {
      return mockRunnerInstance;
    }),
    MemorySession: vi.fn(function MockMemorySession() {
      return mockSessionInstance;
    }),
  };
});

const getHandler = (
  handlers: Map<string, EventHandler>,
  event: string
): EventHandler => {
  const handler = handlers.get(event);
  if (!handler) {
    throw new Error(`Handler for event "${event}" not found`);
  }
  return handler;
};

describe("AgentRunner", () => {
  let logger: Logger;

  const TestOutputSchema = z.object({
    message: z.string(),
  });

  beforeEach(() => {
    logger = new Logger({ level: "error" });
    eventHandlers = new Map();

    mockRunnerInstance = {
      on: vi.fn((event: string, handler: EventHandler) => {
        eventHandlers.set(event, handler);
      }),
      run: vi.fn().mockResolvedValue({ finalOutput: { message: "test" } }),
    };

    mockSessionInstance = {};
  });

  afterEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
  });

  describe("constructor", () => {
    it("registers event handlers", () => {
      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger,
      });

      expect(mockRunnerInstance.on).toHaveBeenCalledWith(
        "agent_tool_start",
        expect.any(Function)
      );
      expect(mockRunnerInstance.on).toHaveBeenCalledWith(
        "agent_tool_end",
        expect.any(Function)
      );
    });
  });

  describe("run", () => {
    it("calls runner.run with agent and session", async () => {
      const agentRunner = new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger,
      });

      await agentRunner.run({ prompt: "test prompt" });

      expect(mockRunnerInstance.run).toHaveBeenCalledWith(
        expect.anything(), // agent
        "test prompt",
        { session: mockSessionInstance }
      );
    });

    it("passes maxTurns option", async () => {
      const agentRunner = new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger,
      });

      await agentRunner.run({ prompt: "test prompt", maxTurns: 3 });

      expect(mockRunnerInstance.run).toHaveBeenCalledWith(
        expect.anything(),
        "test prompt",
        { session: mockSessionInstance, maxTurns: 3 }
      );
    });

    it("returns the run result", async () => {
      const expectedResult = { finalOutput: { message: "success" } };
      mockRunnerInstance.run.mockResolvedValue(expectedResult);

      const agentRunner = new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger,
      });

      const result = await agentRunner.run({ prompt: "test prompt" });

      expect(result).toBe(expectedResult);
    });
  });

  describe("event handlers", () => {
    it("deduplicates tool_start events by call id", () => {
      const toolLogSpy = vi.spyOn(logger, "tool");

      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger,
      });

      const handler = getHandler(eventHandlers, "agent_tool_start");
      const mockTool = { name: "testTool" };
      const mockDetails = { toolCall: { id: "call-123", arguments: "{}" } };

      // First call should log
      handler(null, null, mockTool, mockDetails);
      expect(toolLogSpy).toHaveBeenCalledTimes(1);

      // Second call with same id should not log
      handler(null, null, mockTool, mockDetails);
      expect(toolLogSpy).toHaveBeenCalledTimes(1);

      // Different id should log
      const differentDetails = {
        toolCall: { id: "call-456", arguments: "{}" },
      };
      handler(null, null, mockTool, differentDetails);
      expect(toolLogSpy).toHaveBeenCalledTimes(2);
    });

    it("logs tool arguments when logToolArgs is true", () => {
      const toolLogSpy = vi.spyOn(logger, "tool");

      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger,
        logToolArgs: true,
      });

      const handler = getHandler(eventHandlers, "agent_tool_start");
      const mockTool = { name: "testTool" };
      const mockDetails = {
        toolCall: { id: "call-123", arguments: '{"key":"value"}' },
      };

      handler(null, null, mockTool, mockDetails);

      expect(toolLogSpy).toHaveBeenCalledWith("Calling tool", {
        name: "testTool",
        args: '{"key":"value"}',
      });
    });

    it("does not log tool arguments when logToolArgs is false", () => {
      const toolLogSpy = vi.spyOn(logger, "tool");

      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger,
        logToolArgs: false,
      });

      const handler = getHandler(eventHandlers, "agent_tool_start");
      const mockTool = { name: "testTool" };
      const mockDetails = {
        toolCall: { id: "call-123", arguments: '{"key":"value"}' },
      };

      handler(null, null, mockTool, mockDetails);

      expect(toolLogSpy).toHaveBeenCalledWith("Calling tool", {
        name: "testTool",
      });
    });

    it("logs result preview when logToolResults is true", () => {
      const testLogger = new Logger({ level: "debug" });
      const debugLogSpy = vi.spyOn(testLogger, "debug");

      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger: testLogger,
        logToolResults: true,
      });

      const handler = getHandler(eventHandlers, "agent_tool_end");
      const mockTool = { name: "testTool" };

      handler(null, null, mockTool, "short result");

      expect(debugLogSpy).toHaveBeenCalledWith("Tool result preview", {
        preview: "short result",
      });
    });

    it("truncates long results based on resultPreviewLimit", () => {
      const testLogger = new Logger({ level: "debug" });
      const debugLogSpy = vi.spyOn(testLogger, "debug");

      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger: testLogger,
        logToolResults: true,
        resultPreviewLimit: 10,
      });

      const handler = getHandler(eventHandlers, "agent_tool_end");
      const mockTool = { name: "testTool" };

      handler(null, null, mockTool, "this is a very long result string");

      expect(debugLogSpy).toHaveBeenCalledWith("Tool result preview", {
        preview: "this is a ...",
      });
    });

    it("does not log result when logToolResults is false", () => {
      const testLogger = new Logger({ level: "debug" });
      const debugLogSpy = vi.spyOn(testLogger, "debug");

      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger: testLogger,
        logToolResults: false,
      });

      const handler = getHandler(eventHandlers, "agent_tool_end");
      const mockTool = { name: "testTool" };

      handler(null, null, mockTool, "some result");

      expect(debugLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("memorySession", () => {
    it("returns the session instance", () => {
      const agentRunner = new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger,
      });

      expect(agentRunner.memorySession).toBe(mockSessionInstance);
    });
  });

  describe("default config values", () => {
    it("defaults logToolArgs to false", () => {
      const toolLogSpy = vi.spyOn(logger, "tool");

      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger,
      });

      const handler = getHandler(eventHandlers, "agent_tool_start");
      const mockTool = { name: "testTool" };
      const mockDetails = {
        toolCall: { id: "call-123", arguments: '{"key":"value"}' },
      };

      handler(null, null, mockTool, mockDetails);

      // Should not include arguments
      expect(toolLogSpy).toHaveBeenCalledWith("Calling tool", {
        name: "testTool",
      });
    });

    it("defaults logToolResults to true", () => {
      const testLogger = new Logger({ level: "debug" });
      const debugLogSpy = vi.spyOn(testLogger, "debug");

      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger: testLogger,
      });

      const handler = getHandler(eventHandlers, "agent_tool_end");
      const mockTool = { name: "testTool" };

      handler(null, null, mockTool, "result");

      expect(debugLogSpy).toHaveBeenCalled();
    });

    it("defaults resultPreviewLimit to 200", () => {
      const testLogger = new Logger({ level: "debug" });
      const debugLogSpy = vi.spyOn(testLogger, "debug");

      new AgentRunner({
        name: "TestAgent",
        model: "gpt-5-mini",
        tools: [],
        outputType: TestOutputSchema,
        instructions: "Test instructions",
        logger: testLogger,
      });

      const handler = getHandler(eventHandlers, "agent_tool_end");
      const mockTool = { name: "testTool" };
      const longResult = "x".repeat(250);

      handler(null, null, mockTool, longResult);

      // Should truncate at 200 chars
      expect(debugLogSpy).toHaveBeenCalledWith("Tool result preview", {
        preview: "x".repeat(200) + "...",
      });
    });
  });
});
