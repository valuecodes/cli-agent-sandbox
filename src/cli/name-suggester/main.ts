// pnpm run:name-suggester
// pnpm run:name-suggester --mode ai

import "dotenv/config";
import { writeFile } from "fs/promises";
import { question } from "zx";
import { z } from "zod";
import { Agent, run } from "@openai/agents";
import { Logger } from "../../clients/logger";
import { NameSuggesterPipeline } from "./pipeline";
import { StatsGenerator } from "./stats-generator";
import { StatsPageGenerator } from "./stats-page-generator";
import { createSqlQueryTool } from "./sql-tool";
import { parseArgs } from "../../utils/parse-args";

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

const { db } = await pipeline.setup();

// --- Run selected mode ---
if (mode === "stats") {
  await runStatsMode();
} else {
  await runAiMode();
}

db.close();

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

  const agent = new Agent({
    name: "NameExpertAgent",
    model: "gpt-5-mini",
    tools: [createSqlQueryTool(db)],
    instructions: `You are an expert on Finnish name statistics.
You have access to a database of the top 100 Finnish names per decade (1889-2020).
Use the SQL tool to query the database and answer questions about name trends, popularity, and patterns.
Be helpful, concise, and provide interesting insights.`,
  });

  const userQuestion = await question("Ask about Finnish names: ");

  const result = await run(agent, userQuestion);

  console.log("\n" + result.finalOutput);
}
