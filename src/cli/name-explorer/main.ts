// pnpm run:name-explorer
// pnpm run:name-explorer --mode ai

import "dotenv/config";

import { writeFile } from "fs/promises";
import { AgentRunner } from "~clients/agent-runner";
import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";
import { QuestionHandler } from "~utils/question-handler";

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
import { CliArgsSchema } from "./types/schemas";

const logger = new Logger();

// --- Parse CLI arguments ---
const { refetch: shouldRefetch, mode } = parseArgs({
  logger,
  schema: CliArgsSchema,
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
  logger.info("Statistics page written", { outputPath });
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

  const agentRunner = new AgentRunner({
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
    logger,
    logToolArgs: true,
  });

  const questionHandler = new QuestionHandler({ logger });

  const userQuestion = await questionHandler.askString({
    prompt: "Ask about Finnish names: ",
  });

  if (!userQuestion.trim()) {
    return;
  }

  let currentQuestion = userQuestion;
  while (true) {
    const result = await agentRunner.run({ prompt: currentQuestion });
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
