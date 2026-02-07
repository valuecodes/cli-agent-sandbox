// pnpm run:scrape-publications

// Scrape publication links from a given webpage and save them to tmp/scraped-publications/[url-slug]/

import "dotenv/config";

import path from "node:path";
import { Logger } from "~clients/logger";
import { parseArgs } from "~utils/parse-args";
import { QuestionHandler } from "~utils/question-handler";
import slug from "slug";

import { PublicationPipeline } from "./clients/publication-pipeline";
import { OUTPUT_BASE_DIR } from "./constants";
import { CliArgsSchema } from "./types/schemas";

const logger = new Logger({ level: "info", useColors: true });
let pipeline: PublicationPipeline | null = null;

try {
  logger.info("Scrape Publications running...");

  // 1. Parse command-line arguments
  const {
    url: targetUrl,
    refetch: shouldRefetch,
    filterUrl,
  } = parseArgs({
    logger,
    schema: CliArgsSchema,
  });

  // 2. Create slugified directory path
  const urlWithoutProtocol = targetUrl
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  const urlSlug = slug(urlWithoutProtocol);
  const outputDir = path.join(process.cwd(), OUTPUT_BASE_DIR, urlSlug);

  logger.info("Output directory", { outputDir });

  // 3. Create pipeline
  pipeline = new PublicationPipeline({
    logger,
    outputDir,
    refetch: shouldRefetch,
  });

  // 4. Run pipeline
  const { html, source } = await pipeline.fetchSourceContent({ targetUrl });

  // Get filter substring (from CLI arg or user prompt)
  let filterSubstring = filterUrl;
  if (filterSubstring === undefined) {
    const questionHandler = new QuestionHandler({ logger });
    filterSubstring = await questionHandler.askString({
      prompt:
        "Enter URL substring to filter links by (leave blank to keep all): ",
      allowEmpty: true,
    });
  }

  // Discover and filter links (with automatic fallback if Playwright finds no candidates)
  const { linkCandidates, usedFallback } = await pipeline.discoverLinks({
    html,
    targetUrl,
    filterSubstring,
    source,
  });

  if (usedFallback) {
    logger.info(
      "Note: Used basic HTTP fetch fallback (Playwright found no candidates)"
    );
  }

  // Identify selectors and extract publication metadata
  const { publications } = await pipeline.identifyAndExtractMetadata({
    linkCandidates,
  });

  // Fetch individual publication pages
  await pipeline.fetchPublicationPages({ publications });

  // Extract content from publication HTML files
  const { publications: publicationsWithContent } =
    await pipeline.extractPublicationContent({ publications });

  // Generate review page
  if (publicationsWithContent.length > 0) {
    await pipeline.generateReviewPage({
      publications: publicationsWithContent,
      targetUrl,
    });
  }
} catch (error) {
  logger.error("Fatal error", { error });
  process.exitCode = 1;
} finally {
  if (pipeline) {
    try {
      await pipeline.close();
    } catch (closeError) {
      logger.error("Failed to close pipeline", { error: closeError });
      process.exitCode = process.exitCode ?? 1;
    }
  }
}
