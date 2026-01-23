import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NodeHtmlMarkdown } from "node-html-markdown";
import slug from "slug";
import type { z } from "zod";

import { Fetch } from "../../../clients/fetch";
import type { Logger } from "../../../clients/logger";
import { PlaywrightScraper } from "../../../clients/playwright-scraper";
import type {
  LinkCandidate,
  Publication,
  PublicationLink,
  SelectorResult,
} from "../types/index";
import { PublicationScraper } from "./publication-scraper";
import { ReviewPageGenerator } from "./review-page-generator";

export type FetchSource = "playwright" | "basic-fetch";

export type PublicationPipelineConfig = {
  logger: Logger;
  outputDir: string;
  refetch?: boolean;
};

export type FetchSourceResult = {
  markdown: string;
  html: string;
  fromCache: { markdown: boolean; html: boolean };
  source: FetchSource;
};

export type DiscoverLinksResult = {
  allLinks: string[];
  filteredLinks: string[];
  linkCandidates: z.infer<typeof LinkCandidate>[];
  source: FetchSource;
  usedFallback: boolean;
};

export type IdentifyAndExtractResult = {
  selectors: z.infer<typeof SelectorResult>;
  publications: z.infer<typeof PublicationLink>[];
};

export type FetchPublicationsResult = {
  fetchedCount: number;
  skippedCount: number;
  markdownCount: number;
};

export type ExtractContentResult = {
  publications: z.infer<typeof Publication>[];
  report: {
    total: number;
    successful: number;
    failed: number;
    results: { success: boolean; filename: string; error?: string }[];
  };
};

const MAX_TITLE_SLUG_LENGTH = 80;

export class PublicationPipeline {
  private logger: Logger;
  private outputDir: string;
  private refetch: boolean;
  private fetchClient: Fetch;
  private playwrightScraper: PlaywrightScraper;
  private scraper: PublicationScraper;
  private reviewGenerator: ReviewPageGenerator;
  private htmlToMarkdown: NodeHtmlMarkdown;

  constructor(config: PublicationPipelineConfig) {
    this.logger = config.logger;
    this.outputDir = config.outputDir;
    this.refetch = config.refetch ?? false;
    this.fetchClient = new Fetch({ logger: this.logger });
    this.playwrightScraper = new PlaywrightScraper({ logger: this.logger });
    this.scraper = new PublicationScraper({ logger: this.logger });
    this.reviewGenerator = new ReviewPageGenerator({ logger: this.logger });
    this.htmlToMarkdown = new NodeHtmlMarkdown();
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private titleToSlug(title: string): string {
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

  private urlToShortHash(url: string): string {
    return crypto.createHash("sha256").update(url).digest("hex").slice(0, 8);
  }

  async fetchSourceContent({
    targetUrl,
    forceSource,
  }: {
    targetUrl: string;
    forceSource?: FetchSource;
  }): Promise<FetchSourceResult> {
    await fs.mkdir(this.outputDir, { recursive: true });

    const markdownPath = path.join(this.outputDir, "content.md");
    const htmlPath = path.join(this.outputDir, "content.html");

    const [hasMarkdown, hasHtml] = await Promise.all([
      this.fileExists(markdownPath),
      this.fileExists(htmlPath),
    ]);

    let markdown: string;
    let html: string;
    const fromCache = { markdown: false, html: false };
    const source: FetchSource = forceSource ?? "playwright";

    // Only use cache if not forcing a specific source
    const useCache = !this.refetch && !forceSource;

    if (useCache && hasMarkdown) {
      markdown = await fs.readFile(markdownPath, "utf8");
      fromCache.markdown = true;
    } else if (source === "basic-fetch") {
      markdown = await this.fetchClient.fetchMarkdown(targetUrl);
      await fs.writeFile(markdownPath, markdown);
    } else {
      markdown = await this.playwrightScraper.scrapeMarkdown({ targetUrl });
      await fs.writeFile(markdownPath, markdown);
    }

    if (useCache && hasHtml) {
      html = await fs.readFile(htmlPath, "utf8");
      fromCache.html = true;
    } else if (source === "basic-fetch") {
      html = await this.fetchClient.fetchHtml(targetUrl);
      await fs.writeFile(htmlPath, html);
    } else {
      html = await this.playwrightScraper.scrapeHtml({ targetUrl });
      await fs.writeFile(htmlPath, html);
    }

    const sourceLabel =
      fromCache.markdown && fromCache.html ? "cached" : source;
    const contentStatus = [
      `content.md (${fromCache.markdown ? "cached" : sourceLabel})`,
      `content.html (${fromCache.html ? "cached" : sourceLabel})`,
    ];
    this.logger.info(`Content ready: ${contentStatus.join(", ")}`);

    return { markdown, html, fromCache, source };
  }

  async discoverLinks({
    html,
    targetUrl,
    filterSubstring,
    source = "playwright",
  }: {
    html: string;
    targetUrl: string;
    filterSubstring?: string;
    source?: FetchSource;
  }): Promise<DiscoverLinksResult> {
    let discoveredLinks = this.scraper.discoverLinks(html, targetUrl);
    let allLinks = discoveredLinks.map((link) => link.url);

    await fs.writeFile(
      path.join(this.outputDir, "links.json"),
      JSON.stringify(allLinks, null, 2)
    );
    this.logger.info(`Saved ${allLinks.length} links to links.json`);

    let filteredLinks = (
      filterSubstring
        ? allLinks.filter((link) => link.includes(filterSubstring))
        : allLinks
    ).filter((link) => link !== targetUrl);

    await fs.writeFile(
      path.join(this.outputDir, "filtered-links.json"),
      JSON.stringify(filteredLinks, null, 2)
    );
    this.logger.info(
      `Saved ${filteredLinks.length} filtered links to filtered-links.json`
    );

    let filteredUrlSet = new Set(filteredLinks);
    let linkCandidates = this.scraper.extractLinkCandidates(
      html,
      targetUrl,
      filteredUrlSet
    );

    let usedFallback = false;
    let currentSource = source;

    // Fallback: if Playwright found 0 candidates, retry with basic fetch
    if (linkCandidates.length === 0 && source === "playwright") {
      this.logger.warn(
        "Playwright scraping found 0 link candidates. Retrying with basic HTTP fetch..."
      );

      const fallbackResult = await this.fetchSourceContent({
        targetUrl,
        forceSource: "basic-fetch",
      });

      // Re-discover links with fallback HTML
      discoveredLinks = this.scraper.discoverLinks(
        fallbackResult.html,
        targetUrl
      );
      allLinks = discoveredLinks.map((link) => link.url);

      await fs.writeFile(
        path.join(this.outputDir, "links.json"),
        JSON.stringify(allLinks, null, 2)
      );

      filteredLinks = (
        filterSubstring
          ? allLinks.filter((link) => link.includes(filterSubstring))
          : allLinks
      ).filter((link) => link !== targetUrl);

      await fs.writeFile(
        path.join(this.outputDir, "filtered-links.json"),
        JSON.stringify(filteredLinks, null, 2)
      );

      filteredUrlSet = new Set(filteredLinks);
      linkCandidates = this.scraper.extractLinkCandidates(
        fallbackResult.html,
        targetUrl,
        filteredUrlSet
      );

      usedFallback = true;
      currentSource = "basic-fetch";

      this.logger.info(
        `Fallback fetch found ${linkCandidates.length} link candidates`
      );
    }

    await fs.writeFile(
      path.join(this.outputDir, "link-candidates.json"),
      JSON.stringify(linkCandidates, null, 2)
    );
    this.logger.info(
      `Saved ${linkCandidates.length} link candidates to link-candidates.json`
    );

    return {
      allLinks,
      filteredLinks,
      linkCandidates,
      source: currentSource,
      usedFallback,
    };
  }

  async identifyAndExtractMetadata({
    linkCandidates,
  }: {
    linkCandidates: z.infer<typeof LinkCandidate>[];
  }): Promise<IdentifyAndExtractResult> {
    this.logger.info("Analyzing HTML structure to identify CSS selectors...");

    const selectors = await this.scraper.identifySelectors(linkCandidates);

    await fs.writeFile(
      path.join(this.outputDir, "selectors.json"),
      JSON.stringify(selectors, null, 2)
    );

    this.logger.info(`Identified selectors:`);
    this.logger.info(`  Title: ${selectors.titleSelector}`);
    this.logger.info(`  Date:  ${selectors.dateSelector ?? "(not found)"}`);

    this.logger.info("Extracting publication data...");

    const publications = this.scraper.extractPublicationData(
      linkCandidates,
      selectors
    );

    await fs.writeFile(
      path.join(this.outputDir, "publication-links.json"),
      JSON.stringify(publications, null, 2)
    );

    this.logger.info(
      `Saved ${publications.length} publications to publication-links.json`
    );

    return { selectors, publications };
  }

  async fetchPublicationPages({
    publications,
  }: {
    publications: z.infer<typeof PublicationLink>[];
  }): Promise<FetchPublicationsResult> {
    this.logger.info("--- Fetching Publication Pages ---");

    const publicationsDir = path.join(this.outputDir, "publications");
    await fs.mkdir(publicationsDir, { recursive: true });

    const titleSlugs = publications.map((pub) => this.titleToSlug(pub.title));
    const titleSlugCounts = new Map<string, number>();
    for (const titleSlug of titleSlugs) {
      titleSlugCounts.set(titleSlug, (titleSlugCounts.get(titleSlug) ?? 0) + 1);
    }

    this.logger.info(`Found ${publications.length} publication links to fetch`);

    let fetchedCount = 0;
    let skippedCount = 0;
    let markdownCount = 0;

    for (const [index, publication] of publications.entries()) {
      const url = publication.url;
      const titleSlug = titleSlugs[index];

      if (!titleSlug) {
        this.logger.warn(`Skipping publication with empty title slug: ${url}`);
        continue;
      }

      const needsDisambiguation =
        (titleSlugCounts.get(titleSlug) ?? 0) > 1 ||
        titleSlug === "untitled-publication";
      const filename = needsDisambiguation
        ? `${titleSlug}-${this.urlToShortHash(url)}`
        : titleSlug;
      const pubHtmlPath = path.join(publicationsDir, `${filename}.html`);
      const pubMarkdownPath = path.join(publicationsDir, `${filename}.md`);

      const [hasPubHtml, hasPubMarkdown] = await Promise.all([
        this.fileExists(pubHtmlPath),
        this.fileExists(pubMarkdownPath),
      ]);

      const needsHtml = this.refetch || !hasPubHtml;
      const needsMarkdown = this.refetch || !hasPubMarkdown || needsHtml;

      if (!needsHtml && !needsMarkdown) {
        skippedCount++;
        this.logger.info(
          `[${skippedCount + fetchedCount}/${publications.length}] Cached: ${url}`
        );
        continue;
      }

      try {
        let pubHtml: string | undefined;

        if (needsHtml) {
          pubHtml = await this.fetchClient.fetchHtml(url);
          await fs.writeFile(pubHtmlPath, pubHtml, "utf-8");
          fetchedCount++;
        }

        if (needsMarkdown) {
          pubHtml ??= await fs.readFile(pubHtmlPath, "utf-8");
          const pubMarkdown = this.htmlToMarkdown.translate(pubHtml);
          await fs.writeFile(pubMarkdownPath, pubMarkdown, "utf-8");
          markdownCount++;
        }

        const statusParts = [
          needsHtml ? "Fetched HTML" : "Cached HTML",
          needsMarkdown ? "Wrote Markdown" : "Cached Markdown",
        ];
        this.logger.info(
          `[${skippedCount + fetchedCount}/${publications.length}] ${statusParts.join(", ")}: ${url}`
        );
      } catch (error) {
        this.logger.error(
          `[${skippedCount + fetchedCount}/${publications.length}] Failed: ${url}`,
          error
        );
      }
    }

    this.logger.info(
      `Fetch complete: ${fetchedCount} new HTML, ${markdownCount} markdown written, ${skippedCount} cached`
    );

    return { fetchedCount, skippedCount, markdownCount };
  }

  async extractPublicationContent({
    publications,
  }: {
    publications: z.infer<typeof PublicationLink>[];
  }): Promise<ExtractContentResult> {
    this.logger.info("--- Extracting Publication Content ---");

    const publicationsDir = path.join(this.outputDir, "publications");
    const htmlFiles = (await fs.readdir(publicationsDir)).filter((f) =>
      f.endsWith(".html")
    );

    const firstHtmlFile = htmlFiles[0];

    if (!firstHtmlFile) {
      this.logger.info(
        "No HTML files found in publications directory, skipping content extraction"
      );
      return {
        publications: [],
        report: { total: 0, successful: 0, failed: 0, results: [] },
      };
    }

    const sampleHtmlPath = path.join(publicationsDir, firstHtmlFile);
    const sampleHtml = await fs.readFile(sampleHtmlPath, "utf-8");

    this.logger.info(`Analyzing sample HTML: ${firstHtmlFile}`);
    const contentSelectors =
      await this.scraper.identifyContentSelector(sampleHtml);

    this.logger.info(
      `Identified content selector: ${contentSelectors.contentSelector}`
    );

    await fs.writeFile(
      path.join(this.outputDir, "content-selectors.json"),
      JSON.stringify(contentSelectors, null, 2)
    );

    const publicationsWithContent: z.infer<typeof Publication>[] = [];
    const extractionResults: {
      success: boolean;
      filename: string;
      error?: string;
    }[] = [];

    for (const publication of publications) {
      const pubTitleSlug = this.titleToSlug(publication.title);
      const hash = this.urlToShortHash(publication.url);

      const possibleFilenames = [
        `${pubTitleSlug}.html`,
        `${pubTitleSlug}-${hash}.html`,
      ];

      let pubHtmlContent: string | null = null;
      let usedFilename: string | null = null;

      for (const filename of possibleFilenames) {
        const filePath = path.join(publicationsDir, filename);
        if (await this.fileExists(filePath)) {
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
        this.logger.warn(`HTML file not found for: ${publication.title}`);
        continue;
      }

      const contentMarkdown = this.scraper.extractContent(
        pubHtmlContent,
        contentSelectors.contentSelector
      );

      if (!contentMarkdown) {
        extractionResults.push({
          success: false,
          filename: usedFilename,
          error: "No content found with selector",
        });
        this.logger.warn(`No content found for: ${publication.title}`);
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

      this.logger.info(
        `[${extractionResults.length}/${publications.length}] Extracted: ${publication.title}`
      );
    }

    await fs.writeFile(
      path.join(this.outputDir, "publications.json"),
      JSON.stringify(publicationsWithContent, null, 2)
    );

    const report = {
      total: publications.length,
      successful: extractionResults.filter((r) => r.success).length,
      failed: extractionResults.filter((r) => !r.success).length,
      results: extractionResults,
    };

    await fs.writeFile(
      path.join(this.outputDir, "extraction-report.json"),
      JSON.stringify(report, null, 2)
    );

    this.logger.info(
      `Content extraction complete: ${report.successful}/${report.total} publications processed`
    );

    return { publications: publicationsWithContent, report };
  }

  async generateReviewPage({
    publications,
    targetUrl,
  }: {
    publications: z.infer<typeof Publication>[];
    targetUrl: string;
  }): Promise<string> {
    this.logger.info("--- Generating HTML Review Page ---");

    const reviewHtml = this.reviewGenerator.generate(publications, targetUrl);
    const reviewPath = path.join(this.outputDir, "review.html");
    await fs.writeFile(reviewPath, reviewHtml);

    this.logger.info(`Review page saved to: ${reviewPath}`);

    return reviewPath;
  }

  async close(): Promise<void> {
    await this.playwrightScraper.close();
  }
}
