import { Agent, MemorySession, Runner } from "@openai/agents";
import type { Tool } from "@openai/agents";
import type { ZodType } from "zod";

import type { Logger } from "./logger";

const DEFAULT_RESULT_PREVIEW_LIMIT = 200;

type AgentRunnerConfig<TOutput> = {
  // Agent config
  name: string;
  model: "gpt-5-mini";
  tools: Tool[];
  /** Zod schema for structured output. Omit for plain text responses. */
  outputType?: ZodType<TOutput>;
  instructions: string;

  // Logging config
  logger: Logger;
  logToolArgs?: boolean;
  logToolResults?: boolean;
  resultPreviewLimit?: number;

  /**
   * If true, each run() call uses a fresh context (no session history).
   * Required for reasoning models (gpt-5-mini) when making multiple independent runs.
   */
  stateless?: boolean;
};

type RunProps = {
  prompt: string;
  maxTurns?: number;
  /** If true, run without session history (fresh context). Useful for independent follow-up queries. */
  stateless?: boolean;
};

type AgentType<TOutput> = Agent<unknown, ZodType<TOutput>>;

/**
 * Wrapper around OpenAI Agent + Runner + MemorySession with built-in
 * event logging for tool calls. Provides a consistent interface for
 * running agents across different CLIs.
 */
class AgentRunner<TOutput> {
  private readonly agent: AgentType<TOutput>;
  private readonly runner: Runner;
  private readonly session: MemorySession;
  private readonly logger: Logger;
  private readonly toolsInProgress: Set<string>;
  private readonly logToolArgs: boolean;
  private readonly logToolResults: boolean;
  private readonly resultPreviewLimit: number;
  private readonly stateless: boolean;

  constructor(config: AgentRunnerConfig<TOutput>) {
    this.logger = config.logger;
    this.logToolArgs = config.logToolArgs ?? false;
    this.logToolResults = config.logToolResults ?? true;
    this.resultPreviewLimit =
      config.resultPreviewLimit ?? DEFAULT_RESULT_PREVIEW_LIMIT;
    this.toolsInProgress = new Set();
    this.stateless = config.stateless ?? false;

    this.agent = new Agent({
      name: config.name,
      model: config.model,
      tools: config.tools,
      ...(config.outputType ? { outputType: config.outputType } : {}),
      instructions: config.instructions,
    });

    this.runner = new Runner();
    this.session = new MemorySession();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.runner.on("agent_tool_start", (_context, _agent, tool, details) => {
      const toolCall = details.toolCall as Record<string, unknown>;
      const callId = toolCall.id as string;

      // Deduplicate tool calls (events may fire multiple times)
      if (this.toolsInProgress.has(callId)) {
        return;
      }
      this.toolsInProgress.add(callId);

      if (this.logToolArgs) {
        const args = String(toolCall.arguments);
        this.logger.tool("Calling tool", {
          name: tool.name,
          args: args || "no arguments",
        });
      } else {
        this.logger.tool("Calling tool", { name: tool.name });
      }
    });

    this.runner.on("agent_tool_end", (_context, _agent, tool, result) => {
      this.logger.tool("Tool completed", { name: tool.name });

      if (this.logToolResults) {
        const preview =
          result.length > this.resultPreviewLimit
            ? `${result.slice(0, this.resultPreviewLimit)}...`
            : result;
        this.logger.debug("Tool result preview", { preview });
      }
    });
  }

  // Return type is inferred: agents 0.18's RunResult constraint rejects an
  // explicit RunResult<unknown, Agent<unknown, ZodType<TOutput>>> annotation.
  async run({ prompt, ...rest }: RunProps) {
    // When stateless=true, omit session to avoid reasoning item sequence errors
    // that occur when reusing MemorySession with reasoning models
    const sessionOption = this.stateless ? {} : { session: this.session };
    return this.runner.run(this.agent, prompt, {
      ...sessionOption,
      ...rest,
    });
  }

  get memorySession(): MemorySession {
    return this.session;
  }
}

export type { AgentRunnerConfig, RunProps };
export { AgentRunner };
