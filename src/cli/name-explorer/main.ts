// pnpm run:name-explorer
// pnpm run:name-explorer --mode ai

import "dotenv/config";
import { writeFile } from "fs/promises";
import { Agent, MemorySession, Runner } from "@openai/agents";
import { z } from "zod";
import { Logger } from "../../clients/logger";
import { parseArgs } from "../../utils/parse-args";
import { QuestionHandler } from "../../utils/question-handler";
import { NameSuggesterPipeline } from "./clients/pipeline";
import { StatsGenerator } from "./clients/stats-generator";
import { StatsPageGenerator } from "./clients/stats-page-generator";
import { createFetchNameTool } from "./tools/fetch-name-tool";
import {
  createAggregatedSqlQueryTool,
  createSqlQueryTool,
} from "./tools/sql-tool";
import {
  NameSuggesterOutputSchema,
  NameSuggesterOutputTypeSchema,
} from "./types";

const logger = new Logger();

// --- Parse CLI arguments ---
const { refetch: shouldRefetch, mode } = parseArgs({
  logger,
  schema: z.object({
    refetch: z.coerce.boolean().default(false),
    mode: z.enum(["stats", "ai"]).default("ai"),
  }),
});

// --- Initialize pipeline and database ---
const pipeline = new NameSuggesterPipeline({
  logger,
  outputDir: "tmp/name-explorer",
  refetch: shouldRefetch,
});

const { db, aggregatedDb } = await pipeline.setup();

// --- Stats Mode: Generate HTML statistics page ---
const runStatsMode = async () => {
  logger.info("Computing statistics...");
  const statsGenerator = new StatsGenerator(db);
  const stats = statsGenerator.computeAll();

  logger.info("Generating HTML page...");
  const pageGenerator = new StatsPageGenerator({ logger });
  const html = pageGenerator.generate(stats);

  const outputPath = "tmp/name-explorer/statistics.html";
  await writeFile(outputPath, html, "utf-8");
  logger.info(`Statistics page written to ${outputPath}`);
};

// --- AI Mode: Interactive Q&A with SQL agent ---
const runAiMode = async () => {
  logger.info("Starting AI mode...");

  const tools = [
    createSqlQueryTool(db),
    createFetchNameTool({
      cacheDir: "tmp/name-explorer/individual",
      refetch: shouldRefetch,
    }),
  ];
  if (aggregatedDb) {
    tools.push(createAggregatedSqlQueryTool(aggregatedDb));
  }

  const agent = new Agent({
    name: "NameExpertAgent",
    model: "gpt-5-mini",
    tools,
    outputType: NameSuggesterOutputTypeSchema,
    instructions: `You are an expert on Finnish name statistics.
You have access to multiple data sources:
1. Decade database (query_names_database): Top 100 Finnish names per decade (1889-2020) with columns: decade, gender ('boy'|'girl'), rank, name, count
2. Aggregated database (query_aggregated_names): Total name counts across all time with columns: name, count, gender ('male'|'female')
3. DVV live lookup (fetch_name_statistics): Fetch real-time statistics for any individual name from the official DVV registry

Use the SQL tools for questions about top names, trends, and comparisons within the top 100.
Use fetch_name_statistics for looking up specific names that might not be in the top 100, or for getting the most current data.

Be helpful, concise, and provide interesting insights.

IMPORTANT: Respond with ONLY a valid JSON object:
{"response":{"status":"final"|"needs_clarification","content":"..."}}

- Use status "final" when you have the answer. Put the answer in "content".
- Use status "needs_clarification" only if you cannot answer without more input. Put a single, concise question in "content".
When answering, do not include any questions. Do not include markdown or extra keys.`,
  });

  const runner = new Runner();

  const toolsInProgress = new Set<string>();

  runner.on("agent_tool_start", (_context, _agent, tool, details) => {
    const toolCall = details.toolCall as Record<string, unknown>;
    const callId = toolCall.id as string;
    if (toolsInProgress.has(callId)) {
      return;
    }
    toolsInProgress.add(callId);

    const args = String(toolCall.arguments);
    logger.tool(`Calling ${tool.name}: ${args || "no arguments"}`);
  });

  runner.on("agent_tool_end", (_context, _agent, tool, result) => {
    logger.tool(`${tool.name} completed`);
    const preview =
      result.length > 200 ? result.substring(0, 200) + "..." : result;
    logger.debug(`Result: ${preview}`);
  });

  const questionHandler = new QuestionHandler({ logger });
  const session = new MemorySession();

  const userQuestion = await questionHandler.askString({
    prompt: "Ask about Finnish names: ",
  });

  if (!userQuestion.trim()) {
    return;
  }

  let currentQuestion = userQuestion;
  while (true) {
    const result = await runner.run(agent, currentQuestion, { session });
    const parseResult = NameSuggesterOutputSchema.safeParse(result.finalOutput);

    if (!parseResult.success) {
      logger.warn("Invalid agent response format.");
      break;
    }

    const output = parseResult.data.response;

    if (output.status === "needs_clarification") {
      currentQuestion = await questionHandler.askString({
        prompt: output.content,
        allowEmpty: true,
      });
      if (!currentQuestion.trim()) {
        return;
      }
      continue;
    }

    logger.answer(output.content);
    break;
  }
};

// --- Run selected mode ---
if (mode === "stats") {
  await runStatsMode();
} else {
  await runAiMode();
}

db.close();
aggregatedDb?.close();
