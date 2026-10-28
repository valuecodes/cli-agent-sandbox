import { Agent, run } from "@openai/agents";
import { JSDOM } from "jsdom";
import { NodeHtmlMarkdown } from "node-html-markdown";
import type { z } from "zod";
import type { Logger } from "~clients/logger";

import {
  ContentSelectorResult,
  PublicationLink,
  SelectorResult,
} from "../types/publication";
import type { LinkCandidate } from "../types/publication";
import {
  extractDate,
  extractTitle,
  findParentContainer,
  getStructureSignature,
  scoreStructureSignature,
} from "./publication-html-extractors";

type SelectorAgent = Agent<unknown, typeof SelectorResult>;
type ContentSelectorAgent = Agent<unknown, typeof ContentSelectorResult>;

type PublicationScraperConfig = {
  logger: Logger;
  selectorAgent?: SelectorAgent;
  contentSelectorAgent?: ContentSelectorAgent;
};

/**
 * Scrapes publication data from HTML pages using AI-powered CSS selector identification.
 * Extracts titles, dates, and content from publication listing pages.
 */
class PublicationScraper {
  private readonly logger: Logger;
  private readonly selectorAgent: SelectorAgent;
  private readonly contentSelectorAgent: ContentSelectorAgent;
  private readonly htmlToMarkdown: NodeHtmlMarkdown;

  /**
   * Creates a new PublicationScraper instance.
   * @param config - Configuration with logger and optional custom agents
   */
  constructor(config: PublicationScraperConfig) {
    this.logger = config.logger;
    this.selectorAgent = config.selectorAgent ?? this.createSelectorAgent();
    this.contentSelectorAgent =
      config.contentSelectorAgent ?? this.createContentSelectorAgent();
    this.htmlToMarkdown = new NodeHtmlMarkdown();
  }

  /**
   * Creates the default AI agent for identifying CSS selectors in publication listings.
   * @returns Configured selector agent
   */
  private createSelectorAgent(): SelectorAgent {
    return new Agent({
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
  }

  /**
   * Creates the default AI agent for identifying main content selectors.
   * @returns Configured content selector agent
   */
  private createContentSelectorAgent(): ContentSelectorAgent {
    return new Agent({
      name: "ContentSelectorAnalyzer",
      model: "gpt-5-mini",
      tools: [],
      outputType: ContentSelectorResult,
      instructions: `You are an expert at analyzing HTML structure to identify CSS selectors for main content extraction.

Your task is to analyze HTML from a publication/article page and identify a CSS selector that captures the MAIN CONTENT of the article.

Guidelines:
- Target the primary article content, excluding:
  - Navigation menus
  - Headers and footers
  - Sidebars and promotional content
  - Sign-in prompts and legal disclaimers
- Look for semantic elements like <article>, <main>, or content-specific classes
- Prefer specific class-based selectors (e.g., ".article-body", ".main-content")
- The selector should capture all body paragraphs, headings within the content, and lists

IMPORTANT: Respond with ONLY a valid JSON object:
{
  "contentSelector": "your-css-selector-here"
}`,
    });
  }

  /**
   * Groups candidates by their structure signature.
   */
  private groupCandidatesByStructure(
    candidates: z.infer<typeof LinkCandidate>[]
  ): Map<string, z.infer<typeof LinkCandidate>[]> {
    const groups = new Map<string, z.infer<typeof LinkCandidate>[]>();

    for (const candidate of candidates) {
      const signature = getStructureSignature(candidate.html);
      const group = groups.get(signature) ?? [];
      group.push(candidate);
      groups.set(signature, group);
    }

    return groups;
  }

  /**
   * Selects sample candidates for AI analysis, prioritizing article-like structures.
   */
  private selectSampleCandidates(
    candidates: z.infer<typeof LinkCandidate>[],
    maxSamples = 3
  ): z.infer<typeof LinkCandidate>[] {
    if (candidates.length <= maxSamples) {
      return candidates;
    }

    const groups = this.groupCandidatesByStructure(candidates);

    // Sort groups by score (descending)
    const sortedGroups = [...groups.entries()].sort(
      ([sigA], [sigB]) =>
        scoreStructureSignature(sigB) - scoreStructureSignature(sigA)
    );

    // Take samples from the highest-scoring group
    const firstGroup = sortedGroups[0];
    if (firstGroup) {
      const [topSignature, topGroup] = firstGroup;
      if (topGroup.length > 0) {
        const score = scoreStructureSignature(topSignature);
        this.logger.debug("Selected structure group", {
          signature: topSignature,
          candidates: topGroup.length,
          score,
        });
        return topGroup.slice(0, maxSamples);
      }
    }

    // Fallback to first N candidates
    return candidates.slice(0, maxSamples);
  }

  /**
   * Discovers all links in an HTML page.
   * @param html - The HTML content to parse
   * @param baseUrl - Base URL for resolving relative links
   * @returns Array of discovered publication links
   */
  discoverLinks(
    html: string,
    baseUrl: string
  ): z.infer<typeof PublicationLink>[] {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const anchors = document.querySelectorAll("a[href]");

    const links: z.infer<typeof PublicationLink>[] = [];
    const seenUrls = new Set<string>();

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      const title = anchor.textContent.trim();

      if (href === null || href === "" || !title) {
        continue;
      }

      // Resolve relative URLs
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, baseUrl).href;
      } catch {
        continue; // Skip invalid URLs
      }

      const result = PublicationLink.safeParse({
        title,
        url: absoluteUrl,
      });

      if (result.success && !seenUrls.has(result.data.url)) {
        seenUrls.add(result.data.url);
        links.push(result.data);
      }
    }

    return links;
  }

  /**
   * Extracts link candidates with their HTML context for selector analysis.
   * @param html - The HTML content to parse
   * @param baseUrl - Base URL for resolving relative links
   * @param filterUrls - Set of URLs to include (others are filtered out)
   * @returns Array of link candidates with URL and surrounding HTML
   */
  extractLinkCandidates(
    html: string,
    baseUrl: string,
    filterUrls: Set<string>
  ): z.infer<typeof LinkCandidate>[] {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const anchors = document.querySelectorAll("a[href]");

    const candidates: z.infer<typeof LinkCandidate>[] = [];
    const seenUrls = new Set<string>();

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      if (href === null || href === "") {
        continue;
      }

      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, baseUrl).href;
      } catch {
        continue;
      }

      if (!filterUrls.has(absoluteUrl)) {
        continue;
      }
      if (seenUrls.has(absoluteUrl)) {
        continue;
      }

      seenUrls.add(absoluteUrl);

      const container = findParentContainer(anchor);
      const rawHtml = container.outerHTML;
      const candidateHtml = rawHtml.replaceAll(/\s+/g, " ").trim();

      candidates.push({ url: absoluteUrl, html: candidateHtml });
    }

    return candidates;
  }

  /**
   * Uses AI to identify CSS selectors for extracting title and date from HTML samples.
   * @param candidates - Link candidates to analyze
   * @returns Identified CSS selectors for title and date
   * @throws If no candidates are provided
   */
  async identifySelectors(
    candidates: z.infer<typeof LinkCandidate>[]
  ): Promise<z.infer<typeof SelectorResult>> {
    if (candidates.length === 0) {
      throw new Error("No link candidates available for analysis");
    }

    // Select samples prioritizing article-like structures over navigation
    const sampleCandidates = this.selectSampleCandidates(candidates, 3);

    const htmlSamples = sampleCandidates
      .map(
        (candidate, index) => `--- Sample ${index + 1} ---
URL: ${candidate.url}
HTML:
${candidate.html}`
      )
      .join("\n\n");

    const prompt = `Analyze the following ${sampleCandidates.length} HTML snippets from a publication listing page.
Each snippet represents a publication card/item containing a link to an article.

${htmlSamples}

Based on these samples, identify:
1. A CSS selector for the publication TITLE (the main clickable text that names the article)
2. A CSS selector for the publication DATE (if present)

Look for patterns that are consistent across all samples.
Respond with only a JSON object containing "titleSelector" and "dateSelector" (null if no date found).`;

    const response = await run(this.selectorAgent, prompt);
    return SelectorResult.parse(response.finalOutput);
  }

  /**
   * Extracts publication data from candidates using identified selectors.
   * @param candidates - Link candidates to extract data from
   * @param selectors - CSS selectors to use for extraction
   * @returns Array of extracted publication links with title, URL, and optional date
   */
  extractPublicationData(
    candidates: z.infer<typeof LinkCandidate>[],
    selectors: z.infer<typeof SelectorResult>
  ): z.infer<typeof PublicationLink>[] {
    const publications: z.infer<typeof PublicationLink>[] = [];

    for (const candidate of candidates) {
      // Use multi-strategy extraction for title and date
      // Pass the candidate URL to correctly identify the target anchor in containers with multiple articles
      const title = extractTitle(candidate.html, selectors, candidate.url);
      const date = extractDate(candidate.html, selectors, candidate.url);

      if (title === null || title === "") {
        this.logger.warn("Could not extract title for candidate", {
          url: candidate.url,
        });
        continue;
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
        this.logger.warn("Validation failed for candidate", {
          url: candidate.url,
          error: result.error.message,
        });
      }
    }

    return publications;
  }

  /**
   * Uses AI to identify a CSS selector for main article content.
   * @param sampleHtml - Sample HTML from a publication page
   * @returns Identified content selector
   */
  async identifyContentSelector(
    sampleHtml: string
  ): Promise<z.infer<typeof ContentSelectorResult>> {
    // Truncate HTML for AI analysis (keep first 50KB)
    const truncatedHtml = sampleHtml.slice(0, 50_000);

    const prompt = `Analyze this HTML from a publication page and identify a CSS selector for the MAIN ARTICLE CONTENT:

${truncatedHtml}

Identify a selector that captures the article body text, excluding navigation, headers, footers, and sidebars.`;

    const response = await run(this.contentSelectorAgent, prompt);
    return ContentSelectorResult.parse(response.finalOutput);
  }

  /**
   * Extracts and converts main content to markdown using the identified selector.
   * @param html - The HTML content to extract from
   * @param contentSelector - CSS selector for the main content area
   * @returns Extracted content as markdown, or null if not found
   */
  extractContent(html: string, contentSelector: string): string | null {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const contentElements = document.querySelectorAll(contentSelector);

    if (contentElements.length === 0) {
      return null;
    }

    // Combine all matching elements and convert to markdown
    const htmlParts: string[] = [];
    for (const element of [...contentElements]) {
      htmlParts.push(element.innerHTML);
    }

    const combinedHtml = htmlParts.join("\n\n");
    const markdown = this.htmlToMarkdown
      .translate(combinedHtml)
      .replaceAll(/\n{3,}/g, "\n\n")
      .trim();

    return markdown;
  }
}

export type { PublicationScraperConfig };
export { PublicationScraper };
