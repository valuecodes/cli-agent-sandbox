// pnpm run:scrape-publications

// Scrape publication links from a given webpage and save them to tmp/scraped-publications/[url-slug]/

import "dotenv/config";
import { question, argv } from "zx";
import slug from "slug";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { Fetch, PublicationScraper, ReviewPageGenerator } from "./clients";
import type { Publication } from "./types/index";

console.log("Scrape Publications running...");

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

// 2. Create slugified directory
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
await fs.mkdir(outputDir, { recursive: true });

console.log(`Output directory: ${outputDir}`);

const markdownPath = path.join(outputDir, "content.md");
const htmlPath = path.join(outputDir, "content.html");

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// 3. Fetch content (or reuse cached files)
const [hasMarkdown, hasHtml] = await Promise.all([
  fileExists(markdownPath),
  fileExists(htmlPath),
]);

const fetchClient = new Fetch();
const scraper = new PublicationScraper();
const reviewGenerator = new ReviewPageGenerator();

let markdown: string;
let html: string;

if (!shouldRefetch && hasMarkdown) {
  markdown = await fs.readFile(markdownPath, "utf8");
} else {
  markdown = await fetchClient.fetchMarkdown(targetUrl);
  await fs.writeFile(markdownPath, markdown);
}

if (!shouldRefetch && hasHtml) {
  html = await fs.readFile(htmlPath, "utf8");
} else {
  html = await fetchClient.fetchHtml(targetUrl);
  await fs.writeFile(htmlPath, html);
}

const contentStatus = [
  `${hasMarkdown && !shouldRefetch ? "content.md (cached)" : "content.md (fetched)"}`,
  `${hasHtml && !shouldRefetch ? "content.html (cached)" : "content.html (fetched)"}`,
];

console.log(`Content ready: ${contentStatus.join(", ")}`);

// 5. Discover links from HTML
const discoveredLinks = scraper.discoverLinks(html, targetUrl);
const linkUrls = discoveredLinks.map((link) => link.url);

// 6. Save links to JSON
await fs.writeFile(
  path.join(outputDir, "links.json"),
  JSON.stringify(linkUrls, null, 2)
);

console.log(`Saved ${linkUrls.length} links to links.json`);

// 7. Ask for filter substring and apply it
const filterSubstring =
  filterUrl ??
  (await question(
    "Enter URL substring to filter links by (leave blank to keep all): "
  ));
const filteredLinks = filterSubstring
  ? linkUrls.filter((link) => link.includes(filterSubstring))
  : linkUrls;

await fs.writeFile(
  path.join(outputDir, "filtered-links.json"),
  JSON.stringify(filteredLinks, null, 2)
);

console.log(
  `Saved ${filteredLinks.length} filtered links to filtered-links.json`
);

// 8. Extract link candidates with surrounding HTML
const filteredUrlSet = new Set(filteredLinks);
const linkCandidates = scraper.extractLinkCandidates(
  html,
  targetUrl,
  filteredUrlSet
);

await fs.writeFile(
  path.join(outputDir, "link-candidates.json"),
  JSON.stringify(linkCandidates, null, 2)
);

console.log(
  `Done! Saved ${linkCandidates.length} link candidates to link-candidates.json`
);

// 9. Use agent to identify CSS selectors from HTML samples
console.log("\nAnalyzing HTML structure to identify CSS selectors...");

const selectors = await scraper.identifySelectors(linkCandidates);

// Save selectors to file
await fs.writeFile(
  path.join(outputDir, "selectors.json"),
  JSON.stringify(selectors, null, 2)
);

console.log(`\nIdentified selectors:`);
console.log(`  Title: ${selectors.titleSelector}`);
console.log(`  Date:  ${selectors.dateSelector ?? "(not found)"}`);
console.log(`Saved to selectors.json`);

// 10. Extract publication data using identified selectors
console.log("\nExtracting publication data...");

const publications = scraper.extractPublicationData(linkCandidates, selectors);

// Save publications to JSON
await fs.writeFile(
  path.join(outputDir, "publication-links.json"),
  JSON.stringify(publications, null, 2)
);

console.log(
  `\nDone! Saved ${publications.length} publications to publication-links.json`
);

// 11. Fetch individual publication pages
// ============================================================
// PHASE: FETCH PUBLICATION PAGES
// ============================================================
console.log("\n--- Fetching Publication Pages ---");

const publicationsDir = path.join(outputDir, "publications");
await fs.mkdir(publicationsDir, { recursive: true });

const MAX_TITLE_SLUG_LENGTH = 80;

function titleToSlug(title: string): string {
  const baseSlug = slug(title, { lower: true });
  const trimmedSlug = baseSlug.replace(/^-+|-+$/g, "");
  if (!trimmedSlug) {
    return "untitled-publication";
  }

  if (trimmedSlug.length <= MAX_TITLE_SLUG_LENGTH) {
    return trimmedSlug;
  }

  const shortened = trimmedSlug
    .slice(0, MAX_TITLE_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return shortened || "untitled-publication";
}

function urlToShortHash(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 8);
}

const titleSlugs = publications.map((publication) =>
  titleToSlug(publication.title)
);
const titleSlugCounts = new Map<string, number>();
for (const titleSlug of titleSlugs) {
  titleSlugCounts.set(titleSlug, (titleSlugCounts.get(titleSlug) ?? 0) + 1);
}

console.log(`Found ${publications.length} publication links to fetch`);

let fetchedCount = 0;
let skippedCount = 0;
let markdownCount = 0;
const htmlToMarkdown = new NodeHtmlMarkdown();

for (const [index, publication] of publications.entries()) {
  const url = publication.url;
  const titleSlug = titleSlugs[index];

  if (!titleSlug) {
    console.warn(`Skipping publication with empty title slug: ${url}`);
    continue;
  }

  const needsDisambiguation =
    (titleSlugCounts.get(titleSlug) ?? 0) > 1 ||
    titleSlug === "untitled-publication";
  const filename = needsDisambiguation
    ? `${titleSlug}-${urlToShortHash(url)}`
    : titleSlug;
  const pubHtmlPath = path.join(publicationsDir, `${filename}.html`);
  const pubMarkdownPath = path.join(publicationsDir, `${filename}.md`);

  const [hasPubHtml, hasPubMarkdown] = await Promise.all([
    fileExists(pubHtmlPath),
    fileExists(pubMarkdownPath),
  ]);

  const needsHtml = shouldRefetch || !hasPubHtml;
  const needsMarkdown = shouldRefetch || !hasPubMarkdown || needsHtml;

  // Check cache - skip if already fetched
  if (!needsHtml && !needsMarkdown) {
    skippedCount++;
    console.log(
      `[${skippedCount + fetchedCount}/${publications.length}] Cached: ${url}`
    );
    continue;
  }

  try {
    let pubHtml: string | undefined;

    if (needsHtml) {
      pubHtml = await fetchClient.fetchHtml(url);
      await fs.writeFile(pubHtmlPath, pubHtml, "utf-8");
      fetchedCount++;
    }

    if (needsMarkdown) {
      pubHtml ??= await fs.readFile(pubHtmlPath, "utf-8");

      const pubMarkdown = htmlToMarkdown.translate(pubHtml);
      await fs.writeFile(pubMarkdownPath, pubMarkdown, "utf-8");
      markdownCount++;
    }

    const statusParts = [
      needsHtml ? "Fetched HTML" : "Cached HTML",
      needsMarkdown ? "Wrote Markdown" : "Cached Markdown",
    ];
    console.log(
      `[${skippedCount + fetchedCount}/${publications.length}] ${statusParts.join(", ")}: ${url}`
    );
  } catch (error) {
    console.error(
      `[${skippedCount + fetchedCount}/${publications.length}] Failed: ${url}`,
      error
    );
  }
}

console.log(
  `Fetch complete: ${fetchedCount} new HTML, ${markdownCount} markdown written, ${skippedCount} cached`
);

// 12. Extract content from publication HTML files
// ============================================================
// PHASE: EXTRACT PUBLICATION CONTENT
// ============================================================
console.log("\n--- Extracting Publication Content ---");

// Read sample HTML file to determine content selector
const htmlFiles = (await fs.readdir(publicationsDir)).filter((f) =>
  f.endsWith(".html")
);

const firstHtmlFile = htmlFiles[0];

if (!firstHtmlFile) {
  console.log(
    "No HTML files found in publications directory, skipping content extraction"
  );
} else {
  const sampleHtmlPath = path.join(publicationsDir, firstHtmlFile);
  const sampleHtml = await fs.readFile(sampleHtmlPath, "utf-8");

  console.log(`Analyzing sample HTML: ${firstHtmlFile}`);
  const contentSelectors = await scraper.identifyContentSelector(sampleHtml);

  console.log(
    `Identified content selector: ${contentSelectors.contentSelector}`
  );

  // Save content selectors
  await fs.writeFile(
    path.join(outputDir, "content-selectors.json"),
    JSON.stringify(contentSelectors, null, 2)
  );

  // Extract content from all HTML files
  const publicationsWithContent: z.infer<typeof Publication>[] = [];
  const extractionResults: {
    success: boolean;
    filename: string;
    error?: string;
  }[] = [];

  for (const publication of publications) {
    const pubTitleSlug = titleToSlug(publication.title);
    const hash = urlToShortHash(publication.url);

    // Try both filename patterns
    const possibleFilenames = [
      `${pubTitleSlug}.html`,
      `${pubTitleSlug}-${hash}.html`,
    ];

    let pubHtmlContent: string | null = null;
    let usedFilename: string | null = null;

    for (const filename of possibleFilenames) {
      const filePath = path.join(publicationsDir, filename);
      if (await fileExists(filePath)) {
        pubHtmlContent = await fs.readFile(filePath, "utf-8");
        usedFilename = filename;
        break;
      }
    }

    const firstPossibleFilename = possibleFilenames[0] ?? "unknown.html";

    if (!pubHtmlContent || !usedFilename) {
      extractionResults.push({
        success: false,
        filename: firstPossibleFilename,
        error: "HTML file not found",
      });
      console.warn(`HTML file not found for: ${publication.title}`);
      continue;
    }

    // Extract content using the scraper
    const contentMarkdown = scraper.extractContent(
      pubHtmlContent,
      contentSelectors.contentSelector
    );

    if (!contentMarkdown) {
      extractionResults.push({
        success: false,
        filename: usedFilename,
        error: "No content found with selector",
      });
      console.warn(`No content found for: ${publication.title}`);
      continue;
    }

    publicationsWithContent.push({
      title: publication.title,
      url: publication.url,
      date: publication.date,
      content: contentMarkdown,
      extractedAt: new Date().toISOString(),
    });

    extractionResults.push({
      success: true,
      filename: usedFilename,
    });

    console.log(
      `[${extractionResults.length}/${publications.length}] Extracted: ${publication.title}`
    );
  }

  // Save publications with content
  await fs.writeFile(
    path.join(outputDir, "publications.json"),
    JSON.stringify(publicationsWithContent, null, 2)
  );

  // Save extraction report
  await fs.writeFile(
    path.join(outputDir, "extraction-report.json"),
    JSON.stringify(
      {
        total: publications.length,
        successful: extractionResults.filter((r) => r.success).length,
        failed: extractionResults.filter((r) => !r.success).length,
        results: extractionResults,
      },
      null,
      2
    )
  );

  const successCount = extractionResults.filter((r) => r.success).length;
  console.log(
    `\nContent extraction complete: ${successCount}/${publications.length} publications processed`
  );

  // 13. Generate HTML review page
  // ============================================================
  // PHASE: GENERATE HTML REVIEW PAGE
  // ============================================================
  console.log("\n--- Generating HTML Review Page ---");

  const reviewHtml = reviewGenerator.generate(
    publicationsWithContent,
    targetUrl
  );
  const reviewPath = path.join(outputDir, "review.html");
  await fs.writeFile(reviewPath, reviewHtml);

  console.log(`Review page saved to: ${reviewPath}`);
}
