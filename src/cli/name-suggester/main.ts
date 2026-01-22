// pnpm run:name-suggester

// Scrape Finnish name statistics from DVV and save them to tmp/name-suggester/
// Data is stored in an in-memory SQLite database and also exported to JSON
// Generates an HTML statistics page at tmp/name-suggester/statistics.html

import "dotenv/config";
import { writeFile } from "fs/promises";
import { argv } from "zx";
import { z } from "zod";
import { Logger } from "../../clients/logger";
import { NameSuggesterPipeline } from "./pipeline";
import { StatsGenerator } from "./stats-generator";
import { StatsPageGenerator } from "./stats-page-generator";

const logger = new Logger();

const { refetch: shouldRefetch } = z
  .object({
    refetch: z.coerce.boolean().default(false),
  })
  .parse(argv);

const pipeline = new NameSuggesterPipeline({
  logger,
  outputDir: "tmp/name-suggester",
  refetch: shouldRefetch,
});

const { db } = await pipeline.setup();

// Generate statistics and HTML page
logger.info("Computing statistics...");
const statsGenerator = new StatsGenerator(db);
const stats = statsGenerator.computeAll();

logger.info("Generating HTML page...");
const pageGenerator = new StatsPageGenerator({ logger });
const html = pageGenerator.generate(stats);

const outputPath = "tmp/name-suggester/statistics.html";
await writeFile(outputPath, html, "utf-8");
logger.info(`Statistics page written to ${outputPath}`);

db.close();
