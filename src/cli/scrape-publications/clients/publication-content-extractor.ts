import fs from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import type { Logger } from "~clients/logger";

import type { Publication, PublicationLink } from "../types/publication";
import { fileExists, titleToSlug, urlToShortHash } from "./publication-files";
import type {
  ExtractContentResult,
  ExtractionResult,
} from "./publication-pipeline-types";
import type { PublicationScraper } from "./publication-scraper";

type PublicationContentExtractorConfig = {
  logger: Logger;
  outputDir: string;
  scraper: PublicationScraper;
};

/**
 * Extracts main content from fetched publication HTML files
 * (the content-extraction step of PublicationPipeline).
 */
class PublicationContentExtractor {
  private readonly logger: Logger;
  private readonly outputDir: string;
  private readonly scraper: PublicationScraper;

  constructor(config: PublicationContentExtractorConfig) {
    this.logger = config.logger;
    this.outputDir = config.outputDir;
    this.scraper = config.scraper;
  }

  /**
   * Uses AI to identify content selectors from the first fetched HTML file,
   * then converts each publication's content to markdown.
   */
  async extract({
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

    if (firstHtmlFile === undefined || firstHtmlFile === "") {
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

    this.logger.info("Analyzing sample HTML", { file: firstHtmlFile });
    const contentSelectors =
      await this.scraper.identifyContentSelector(sampleHtml);

    this.logger.info("Identified content selector", {
      selector: contentSelectors.contentSelector,
    });

    await fs.writeFile(
      path.join(this.outputDir, "content-selectors.json"),
      JSON.stringify(contentSelectors, null, 2)
    );

    const publicationsWithContent: z.infer<typeof Publication>[] = [];
    const extractionResults: ExtractionResult[] = [];

    for (const publication of publications) {
      const pubTitleSlug = titleToSlug(publication.title);
      const hash = urlToShortHash(publication.url);

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

      if (
        pubHtmlContent === null ||
        pubHtmlContent === "" ||
        usedFilename === null ||
        usedFilename === ""
      ) {
        extractionResults.push({
          success: false,
          filename: firstPossibleFilename,
          error: "HTML file not found",
        });
        this.logger.warn("HTML file not found for publication", {
          title: publication.title,
        });
        continue;
      }

      const contentMarkdown = this.scraper.extractContent(
        pubHtmlContent,
        contentSelectors.contentSelector
      );

      if (contentMarkdown === null || contentMarkdown === "") {
        extractionResults.push({
          success: false,
          filename: usedFilename,
          error: "No content found with selector",
        });
        this.logger.warn("No content found for publication", {
          title: publication.title,
        });
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

      this.logger.info("Publication extracted", {
        index: extractionResults.length,
        total: publications.length,
        title: publication.title,
      });
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

    this.logger.info("Content extraction complete", {
      successful: report.successful,
      total: report.total,
    });

    return { publications: publicationsWithContent, report };
  }
}

export { PublicationContentExtractor };
