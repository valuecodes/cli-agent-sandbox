// pnpm run:grants-explorer
// pnpm run:grants-explorer --dir=tmp/grants-explorer/paatokset
// pnpm run:grants-explorer --refetch

import "dotenv/config";

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { AgentRunner } from "~clients/agent-runner";
import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";
import { QuestionHandler } from "~utils/question-handler";

import { writeCombinedGrants } from "./clients/combined-writer";
import { GrantsDatabase } from "./clients/database";
import { readManifest } from "./clients/manifest";
import { XlsxDownloader } from "./clients/xlsx-downloader";
import { XlsxLoader } from "./clients/xlsx-loader";
import {
  AGENT_MODEL,
  AGENT_NAME,
  DEFAULT_COMBINED_GRANTS_FILE,
  DEFAULT_PAATOKSET_DIR,
  MANIFEST_FILE,
  PAATOKSET_SOURCE_URL,
} from "./constants";
import { shouldRefetch } from "./should-refetch";
import { createSqlQueryTool } from "./tools/sql-tool";
import {
  CliArgsSchema,
  GrantsAgentOutputSchema,
  GrantsAgentOutputTypeSchema,
} from "./types/schemas";
import type { GrantRow } from "./types/schemas";

const logger = new Logger();

let db: GrantsDatabase | null = null;

try {
  const { dir, refetch } = parseArgs({ logger, schema: CliArgsSchema });
  const destDir = dir ?? DEFAULT_PAATOKSET_DIR;

  // The manifest is the single canonical proof of a complete download: even
  // if some sector xlsx files exist on disk, an absent manifest means a prior
  // run was interrupted before listing every sector. Refetch handles that as
  // a resume — only missing sector files are re-fetched, then manifest is
  // re-written.
  const manifestExists = existsSync(join(destDir, MANIFEST_FILE));
  if (shouldRefetch({ refetch, exists: manifestExists })) {
    if (!manifestExists) {
      logger.info("Sectors manifest missing; downloading", { destDir });
    }
    await new XlsxDownloader({
      logger,
      sourceUrl: PAATOKSET_SOURCE_URL,
    }).download(destDir);
  }

  const manifest = await readManifest(destDir);
  logger.info("Loaded sectors manifest", {
    destDir,
    sectors: manifest.length,
  });

  db = new GrantsDatabase(logger);
  const loader = new XlsxLoader({ logger });
  const allRows: GrantRow[] = [];
  for (const sector of manifest) {
    const xlsxPath = join(destDir, `${sector.code}.xlsx`);
    if (!existsSync(xlsxPath)) {
      throw new Error(
        `Manifest references ${sector.code} but ${xlsxPath} is missing — re-run with --refetch`
      );
    }
    const rows = loader.load(xlsxPath, { sector });
    db.insertRows(rows);
    allRows.push(...rows);
  }
  logger.info("Grants loaded into in-memory SQL", {
    rows: db.getTotalCount(),
    sectors: manifest.length,
  });

  // Persist a single combined JSON of every row alongside the per-sector
  // xlsx cache. Always written after a successful load so the on-disk file
  // mirrors what was just loaded — downstream tools (jq/duckdb/pandas) can
  // point at one canonical path without re-running the xlsx parse pipeline.
  await writeCombinedGrants({
    logger,
    path: join(dirname(destDir), DEFAULT_COMBINED_GRANTS_FILE),
    rows: allRows,
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
- sektoriluokitus_code                             Finnish institutional sector code, e.g. "S15", "S131311" (S + 1–6 digits). Two sentinels: "BLANK" (no sector) and "PUUTTUU" (source-tagged "sector missing"). Indexed.
- sektoriluokitus_label                            Human-readable sector name matching the code, e.g. "Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt".

Notes:
- Amounts and dates can be NULL; SUM/AVG handle that correctly.
- For Y-tunnus equality searches use recipient_business_id = '<y-tunnus>' (preferred — indexed and exact). The full string is also available in recipient for substring/name matching.
- To aggregate grants per legal entity, GROUP BY recipient_business_id (and filter out NULL when only registered entities are wanted).
- The dataset spans every Sektoriluokitus available upstream (including coarse codes like S11 and deep ones like S131311). Filter by sektoriluokitus_code to scope to one sector — e.g. WHERE sektoriluokitus_code = 'S15' reproduces the legacy NPISH-only view. Codes 'BLANK'/'PUUTTUU' are the sector-less rows; exclude them with WHERE sektoriluokitus_code LIKE 'S%' if you only want classified sectors.
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
