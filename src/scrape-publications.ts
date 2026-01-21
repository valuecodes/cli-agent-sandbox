// pnpm run:scrape-publications

// Scrape publication links from a given webpage and save them to tmp/scraped-publications/[url-slug]/
// Phase 1: Fetch and save HTML/Markdown content
// Phase 2: Parse links from HTML using JSDOM and save to links.json

import "dotenv/config";
import { question, argv } from "zx";
import slug from "slug";
import { JSDOM } from "jsdom";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { Agent, run } from "@openai/agents";
import { Fetch } from "./clients/fetch";
import { PublicationLink, SelectorResult } from "./types/index";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

console.log("Scrape Publications running...");

// 1. Parse command-line arguments
const {
  url: targetUrl,
  refetch: shouldRefetch,
  filterUrl,
} = z
  .object({
    url: z.url(),
    refetch: z.boolean().optional(),
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

// 5. Parse links from HTML using JSDOM
const dom = new JSDOM(html);
const document = dom.window.document;
const anchors = document.querySelectorAll("a[href]");

const links: string[] = [];
const seenUrls = new Set<string>();

for (const anchor of anchors) {
  const href = anchor.getAttribute("href");
  const title = anchor.textContent.trim();

  if (!href || !title) continue;

  // Resolve relative URLs
  let absoluteUrl: string;
  try {
    absoluteUrl = new URL(href, targetUrl).href;
  } catch {
    continue; // Skip invalid URLs
  }

  const result = PublicationLink.safeParse({
    title,
    url: absoluteUrl,
  });

  if (result.success && !seenUrls.has(result.data.url)) {
    seenUrls.add(result.data.url);
    links.push(result.data.url);
  }
}

// 6. Ask for filter substring and apply it
const filterSubstring =
  filterUrl ??
  (await question(
    "Enter URL substring to filter links by (leave blank to keep all): "
  ));
const filteredLinks = filterSubstring
  ? links.filter((link) => link.includes(filterSubstring))
  : links;

// 7. Save links to JSON
await fs.writeFile(
  path.join(outputDir, "links.json"),
  JSON.stringify(links, null, 2)
);

await fs.writeFile(
  path.join(outputDir, "filtered-links.json"),
  JSON.stringify(filteredLinks, null, 2)
);

console.log(
  `Saved ${links.length} links to links.json and ${filteredLinks.length} links to filtered-links.json`
);

// 8. Parse link candidates with surrounding HTML
const filteredUrlSet = new Set(filteredLinks);
const linkCandidates: { url: string; html: string }[] = [];

for (const anchor of anchors) {
  const href = anchor.getAttribute("href");
  if (!href) continue;

  let absoluteUrl: string;
  try {
    absoluteUrl = new URL(href, targetUrl).href;
  } catch {
    continue;
  }

  if (!filteredUrlSet.has(absoluteUrl)) continue;

  // Find a suitable parent container for this link
  let container: Element | null = anchor.parentElement;
  const containerTags = ["LI", "ARTICLE", "DIV", "SECTION", "TR", "DD"];

  while (container && !containerTags.includes(container.tagName)) {
    container = container.parentElement;
  }

  // Fall back to parent if no suitable container found
  container ??= anchor.parentElement;

  const rawHtml = container ? container.outerHTML : anchor.outerHTML;
  const html = rawHtml.replace(/\s+/g, " ").trim();

  linkCandidates.push({ url: absoluteUrl, html });
}

// Remove duplicates by URL
const seenCandidateUrls = new Set<string>();
const uniqueCandidates = linkCandidates.filter((candidate) => {
  if (seenCandidateUrls.has(candidate.url)) return false;
  seenCandidateUrls.add(candidate.url);
  return true;
});

await fs.writeFile(
  path.join(outputDir, "link-candidates.json"),
  JSON.stringify(uniqueCandidates, null, 2)
);

console.log(
  `Done! Saved ${uniqueCandidates.length} link candidates to link-candidates.json`
);

// 9. Use agent to identify CSS selectors from HTML samples
console.log("\nAnalyzing HTML structure to identify CSS selectors...");

const selectorAgent = new Agent({
  name: "SelectorAnalyzer",
  model: "gpt-5-mini",
  tools: [],
  outputType: SelectorResult,
  instructions: `You are an expert at analyzing HTML structure and identifying CSS selectors.

Your task is to analyze HTML snippets from a publication listing page and identify CSS selectors that can be used to extract:
1. Title (REQUIRED): The publication/article title
2. Date (OPTIONAL): The publication date, if present

Guidelines for selector identification:
- Prefer class-based selectors (e.g., ".class-name") over tag-only selectors
- Use specific selectors that uniquely identify the target element
- For nested elements, use descendant selectors (e.g., "h3.title a")
- If multiple valid selectors exist, choose the most specific and reliable one
- For dates, look for <time> elements, date-related classes, or datetime attributes

IMPORTANT: You must respond with ONLY a valid JSON object in this exact format:
{
  "titleSelector": "selector-for-title",
  "dateSelector": "selector-for-date-or-null"
}

If you cannot identify a date selector, set dateSelector to null.
Do not include any explanation or markdown - only the JSON object.`,
});

// Take first 3 candidates (or fewer if less available)
const sampleCandidates = uniqueCandidates.slice(0, 3);

if (sampleCandidates.length === 0) {
  console.error("Error: No link candidates available for analysis");
  process.exit(1);
}

const htmlSamples = sampleCandidates
  .map((candidate, index) => {
    return `--- Sample ${index + 1} ---
URL: ${candidate.url}
HTML:
${candidate.html}`;
  })
  .join("\n\n");

const selectorPrompt = `Analyze the following ${sampleCandidates.length} HTML snippets from a publication listing page.
Each snippet represents a publication card/item containing a link to an article.

${htmlSamples}

Based on these samples, identify:
1. A CSS selector for the publication TITLE (the main clickable text that names the article)
2. A CSS selector for the publication DATE (if present)

Look for patterns that are consistent across all samples.
Respond with only a JSON object containing "titleSelector" and "dateSelector" (null if no date found).`;

const selectorResponse = await run(selectorAgent, selectorPrompt);
const selectors = SelectorResult.parse(selectorResponse.finalOutput);

// Save selectors to file
await fs.writeFile(
  path.join(outputDir, "selectors.json"),
  JSON.stringify(selectors, null, 2)
);

console.log(`\nIdentified selectors:`);
console.log(`  Title: ${selectors.titleSelector}`);
console.log(`  Date:  ${selectors.dateSelector ?? "(not found)"}`);
console.log(`Saved to selectors.json`);

// Helper to convert various date formats to ISO (YYYY-MM-DD)
function parseToIsoDate(rawDate: string): string | undefined {
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return rawDate;
  }

  // MM.DD.YY format (e.g., "01.15.26")
  const dotFormat = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(rawDate);
  if (dotFormat?.[1] && dotFormat[2] && dotFormat[3]) {
    const month = dotFormat[1];
    const day = dotFormat[2];
    const year = dotFormat[3];
    const fullYear = Number.parseInt(year, 10) > 50 ? `19${year}` : `20${year}`;
    return `${fullYear}-${month}-${day}`;
  }

  // MM/DD/YYYY or MM-DD-YYYY format
  const slashFormat = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(rawDate);
  if (slashFormat?.[1] && slashFormat[2] && slashFormat[3]) {
    const month = slashFormat[1];
    const day = slashFormat[2];
    const year = slashFormat[3];
    return `${year}-${month}-${day}`;
  }

  return undefined;
}

// 10. Extract publication data using identified selectors
console.log("\nExtracting publication data...");

const publications: z.infer<typeof PublicationLink>[] = [];

for (const candidate of uniqueCandidates) {
  const candidateDom = new JSDOM(candidate.html);
  const candidateDoc = candidateDom.window.document;

  // Extract title
  const titleElement = candidateDoc.querySelector(selectors.titleSelector);
  const title = titleElement?.textContent.trim();

  // Extract date if selector exists
  let date: string | undefined;
  if (selectors.dateSelector) {
    const dateElement = candidateDoc.querySelector(selectors.dateSelector);
    // Try datetime attribute first, then text content
    const rawDate =
      dateElement?.getAttribute("datetime") ??
      dateElement?.textContent.trim() ??
      undefined;

    // Convert common date formats to ISO (YYYY-MM-DD)
    if (rawDate) {
      date = parseToIsoDate(rawDate);
    }
  }

  // Validate and add to publications
  const result = PublicationLink.safeParse({
    title,
    url: candidate.url,
    date,
  });

  if (result.success) {
    publications.push(result.data);
  } else {
    console.warn(`Skipping invalid publication: ${candidate.url}`);
  }
}

// Save publications to JSON
await fs.writeFile(
  path.join(outputDir, "publications.json"),
  JSON.stringify(publications, null, 2)
);

console.log(
  `\nDone! Saved ${publications.length} publications to publications.json`
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

  const needsHtml = shouldRefetch ?? !hasPubHtml;
  const needsMarkdown = (shouldRefetch ?? !hasPubMarkdown) || needsHtml;

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
