import { Agent, MemorySession, Runner } from "@openai/agents";
import type { RunResult, Tool } from "@openai/agents";
import type { ZodType } from "zod";

import type { Logger } from "./logger";

const DEFAULT_RESULT_PREVIEW_LIMIT = 200;

export type AgentRunnerConfig<TOutput> = {
  // Agent config
  name: string;
  model: "gpt-5-mini";
  tools: Tool[];
  outputType: ZodType<TOutput>;
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

export type RunProps = {
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
export class AgentRunner<TOutput> {
  private agent: AgentType<TOutput>;
  private runner: Runner;
  private session: MemorySession;
  private logger: Logger;
  private toolsInProgress: Set<string>;
  private logToolArgs: boolean;
  private logToolResults: boolean;
  private resultPreviewLimit: number;
  private stateless: boolean;

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
      outputType: config.outputType,
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
        this.logger.tool(`Calling ${tool.name}: ${args || "no arguments"}`);
      } else {
        this.logger.tool(`Calling ${tool.name}`);
      }
    });

    this.runner.on("agent_tool_end", (_context, _agent, tool, result) => {
      this.logger.tool(`${tool.name} completed`);

      if (this.logToolResults) {
        const preview =
          result.length > this.resultPreviewLimit
            ? result.substring(0, this.resultPreviewLimit) + "..."
            : result;
        this.logger.debug(`Result: ${preview}`);
      }
    });
  }

  async run({
    prompt,
    ...rest
  }: RunProps): Promise<RunResult<unknown, AgentType<TOutput>>> {
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
