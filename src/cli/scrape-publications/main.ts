// pnpm run:scrape-publications

// Scrape publication links from a given webpage and save them to tmp/scraped-publications/[url-slug]/

import "dotenv/config";
import { question, argv } from "zx";
import slug from "slug";
import path from "node:path";
import { z } from "zod";
import { Logger } from "../../clients/logger";
import { PublicationPipeline } from "../../clients/publication-pipeline";

const logger = new Logger({ level: "info", useColors: true });

logger.info("Scrape Publications running...");

// 1. Parse command-line arguments
const {
  url: targetUrl,
  refetch: shouldRefetch,
  filterUrl,
} = z
  .object({
    url: z.url(),
    refetch: z.coerce.boolean().default(false),
    filterUrl: z.string().optional(),
  })
  .parse(argv);

// 2. Create slugified directory path
const urlWithoutProtocol = targetUrl
  .replace(/^https?:\/\//, "")
  .replace(/^www\./, "");
const urlSlug = slug(urlWithoutProtocol);
const outputDir = path.join(
  process.cwd(),
  "tmp",
  "scraped-publications",
  urlSlug
);

logger.info(`Output directory: ${outputDir}`);

// 3. Create pipeline
const pipeline = new PublicationPipeline({
  logger,
  outputDir,
  refetch: shouldRefetch,
});

// 4. Run pipeline
const { html, source } = await pipeline.fetchSourceContent({ targetUrl });

// Get filter substring (from CLI arg or user prompt)
const filterSubstring =
  filterUrl ??
  (await question(
    "Enter URL substring to filter links by (leave blank to keep all): "
  ));

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

// Cleanup
await pipeline.close();
