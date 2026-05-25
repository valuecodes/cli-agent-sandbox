// pnpm run:grants-explorer
// pnpm run:grants-explorer --file=tmp/paatokset.xlsx
// pnpm run:grants-explorer --refetch

import "dotenv/config";

import { existsSync } from "node:fs";
import { AgentRunner } from "~clients/agent-runner";
import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";
import { QuestionHandler } from "~utils/question-handler";

import { GrantsDatabase } from "./clients/database";
import { XlsxDownloader } from "./clients/xlsx-downloader";
import { XlsxLoader } from "./clients/xlsx-loader";
import {
  AGENT_MODEL,
  AGENT_NAME,
  DEFAULT_XLSX_PATH,
  PAATOKSET_SOURCE_URL,
} from "./constants";
import { shouldRefetch } from "./should-refetch";
import { createSqlQueryTool } from "./tools/sql-tool";
import {
  CliArgsSchema,
  GrantsAgentOutputSchema,
  GrantsAgentOutputTypeSchema,
} from "./types/schemas";

const logger = new Logger();

let db: GrantsDatabase | null = null;

try {
  const { file, refetch } = parseArgs({ logger, schema: CliArgsSchema });
  const xlsxPath = file ?? DEFAULT_XLSX_PATH;

  const exists = existsSync(xlsxPath);
  if (shouldRefetch({ refetch, exists })) {
    if (!exists) {
      logger.info("Local xlsx missing; downloading", { xlsxPath });
    }
    await new XlsxDownloader({
      logger,
      sourceUrl: PAATOKSET_SOURCE_URL,
    }).download(xlsxPath);
  }

  const rows = new XlsxLoader({ logger }).load(xlsxPath);

  db = new GrantsDatabase(logger);
  db.insertRows(rows);
  logger.info("Grants loaded into in-memory SQL", {
    rows: db.getTotalCount(),
  });

  const agentRunner = new AgentRunner({
    name: AGENT_NAME,
    model: AGENT_MODEL,
    tools: [createSqlQueryTool(db)],
    outputType: GrantsAgentOutputTypeSchema,
    instructions: `You are an analyst for a Finnish grant-decisions dataset, loaded into an in-memory SQLite database.

Use the \`query_grants\` tool to run SQL SELECT queries against the \`grants\` table.

Schema (English column | source Finnish header):
- decision_date (Päätös pvm)                       ISO date 'YYYY-MM-DD', may be NULL
- recipient (Saajan nimi)                          full original name, e.g. "Lapin Martat ry (0210606-0)"
- recipient_business_id (extracted from Saajan nimi) Y-tunnus only, e.g. "0210606-0"; NULL for recipients without one (private persons, foreign entities, working groups). Indexed.
- granting_authority (Myöntäjä)                    e.g. "Lapin ELY-keskus"
- case_number (Asianumero)                         TEXT
- amount_applied (Haettu)                          EUR, may be NULL
- amount_granted (Myönnetty)                       EUR, may be NULL
- has_eu_funding (EU-varat)                        0 or 1
- purpose (Hyväksytty käyttötarkoitus)
- programme (Haun nimi (asianumero))
- region (Alueet)                                  region / municipality

Notes:
- Amounts and dates can be NULL; SUM/AVG handle that correctly.
- For Y-tunnus equality searches use recipient_business_id = '<y-tunnus>' (preferred — indexed and exact). The full string is also available in recipient for substring/name matching.
- To aggregate grants per legal entity, GROUP BY recipient_business_id (and filter out NULL when only registered entities are wanted).
- Answer in the language of the user's question (Finnish or English).
- Be concise and grounded in the SQL results; don't invent numbers.

IMPORTANT: Respond with ONLY a valid JSON object:
{"response":{"status":"final"|"needs_clarification","content":"..."}}

- "final": answer in "content".
- "needs_clarification": one concise follow-up question in "content".
No markdown, no extra keys.`,
    logger,
    logToolArgs: true,
    stateless: true,
  });

  const questionHandler = new QuestionHandler({ logger });
  const userQuestion = await questionHandler.askString({
    prompt: "Ask about Finnish grant decisions: ",
  });
  if (!userQuestion.trim()) {
    // Empty input → exit quietly without invoking the model.
    db.close();
    db = null;
    process.exit(0);
  }

  let currentQuestion = userQuestion;
  while (true) {
    const result = await agentRunner.run({ prompt: currentQuestion });
    const parseResult = GrantsAgentOutputSchema.safeParse(result.finalOutput);
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
        break;
      }
      continue;
    }

    logger.answer(output.content);
    break;
  }
} catch (error) {
  logger.error("Fatal error", { error });
  process.exitCode = 1;
} finally {
  db?.close();
}
