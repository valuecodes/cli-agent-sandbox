// pnpm run:name-suggester
// pnpm run:name-suggester --mode ai

import "dotenv/config";
import { writeFile } from "fs/promises";
import { z } from "zod";
import { Agent, Runner } from "@openai/agents";
import { Logger } from "../../clients/logger";
import { NameSuggesterPipeline } from "./pipeline";
import { StatsGenerator } from "./stats-generator";
import { StatsPageGenerator } from "./stats-page-generator";
import { createAggregatedSqlQueryTool, createSqlQueryTool } from "./sql-tool";
import { parseArgs } from "../../utils/parse-args";
import { QuestionHandler } from "../../utils/question-handler";

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
  outputDir: "tmp/name-suggester",
  refetch: shouldRefetch,
});

const { db, aggregatedDb } = await pipeline.setup();

// --- Run selected mode ---
if (mode === "stats") {
  await runStatsMode();
} else {
  await runAiMode();
}

db.close();
aggregatedDb?.close();

// --- Stats Mode: Generate HTML statistics page ---
async function runStatsMode() {
  logger.info("Computing statistics...");
  const statsGenerator = new StatsGenerator(db);
  const stats = statsGenerator.computeAll();

  logger.info("Generating HTML page...");
  const pageGenerator = new StatsPageGenerator({ logger });
  const html = pageGenerator.generate(stats);

  const outputPath = "tmp/name-suggester/statistics.html";
  await writeFile(outputPath, html, "utf-8");
  logger.info(`Statistics page written to ${outputPath}`);
}

// --- AI Mode: Interactive Q&A with SQL agent ---
async function runAiMode() {
  logger.info("Starting AI mode...");

  const tools = [createSqlQueryTool(db)];
  if (aggregatedDb) {
    tools.push(createAggregatedSqlQueryTool(aggregatedDb));
  }

  const agent = new Agent({
    name: "NameExpertAgent",
    model: "gpt-5-mini",
    tools,
    instructions: `You are an expert on Finnish name statistics.
You have access to two databases:
1. Decade database (query_names_database): Top 100 Finnish names per decade (1889-2020) with columns: decade, gender ('boy'|'girl'), rank, name, count
2. Aggregated database (query_aggregated_names): Total name counts across all time with columns: name, count, gender ('male'|'female')

Use the appropriate SQL tool to query the databases and answer questions about name trends, popularity, and patterns.
Be helpful, concise, and provide interesting insights.`,
  });

  const runner = new Runner();

  const toolsInProgress = new Set<string>();

  runner.on("agent_tool_start", (_context, _agent, tool, details) => {
    const toolCall = details.toolCall as Record<string, unknown>;
    const callId = toolCall.id as string;
    if (toolsInProgress.has(callId)) return;
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
  const userQuestion = await questionHandler.askString({
    prompt: "Ask about Finnish names: ",
  });

  const result = await runner.run(agent, userQuestion);

  if (result.finalOutput) {
    logger.answer(result.finalOutput);
  }
}
