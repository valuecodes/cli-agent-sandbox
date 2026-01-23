import { JSDOM } from "jsdom";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { Agent, run } from "@openai/agents";
import type { z } from "zod";
import {
  PublicationLink,
  SelectorResult,
  ContentSelectorResult,
} from "../types/index";
import type { LinkCandidate } from "../types/index";
import type { Logger } from "../../../clients/logger";

type SelectorAgent = Agent<unknown, typeof SelectorResult>;
type ContentSelectorAgent = Agent<unknown, typeof ContentSelectorResult>;

export type PublicationScraperConfig = {
  logger: Logger;
  selectorAgent?: SelectorAgent;
  contentSelectorAgent?: ContentSelectorAgent;
};

export class PublicationScraper {
  private logger: Logger;
  private selectorAgent: SelectorAgent;
  private contentSelectorAgent: ContentSelectorAgent;
  private htmlToMarkdown: NodeHtmlMarkdown;

  constructor(config: PublicationScraperConfig) {
    this.logger = config.logger;
    this.selectorAgent = config.selectorAgent ?? this.createSelectorAgent();
    this.contentSelectorAgent =
      config.contentSelectorAgent ?? this.createContentSelectorAgent();
    this.htmlToMarkdown = new NodeHtmlMarkdown();
  }

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

  private parseToIsoDate(rawDate: string): string | undefined {
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
      const fullYear =
        Number.parseInt(year, 10) > 50 ? `19${year}` : `20${year}`;
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

  private findParentContainer(anchor: Element): Element {
    const containerTags = ["LI", "ARTICLE", "DIV", "SECTION", "TR", "DD"];
    let container: Element | null = anchor.parentElement;

    while (container && !containerTags.includes(container.tagName)) {
      container = container.parentElement;
    }

    // Fall back to parent if no suitable container found
    return container ?? anchor.parentElement ?? anchor;
  }

  /**
   * Creates a structure signature for an HTML snippet based on its structural features.
   * Used to group similar HTML structures together for better sampling.
   */
  private getStructureSignature(html: string): string {
    const dom = new JSDOM(html);
    const root = dom.window.document.body.firstElementChild;
    if (!root) {
      return "unknown";
    }

    const tag = root.tagName.toLowerCase();
    const hasImage = !!root.querySelector("img");
    const hasHeading = !!root.querySelector("h1, h2, h3, h4, h5, h6");
    const hasDate = !!root.querySelector(
      'time, [class*="date"], [class*="Date"]'
    );

    return `${tag}:img=${hasImage}:h=${hasHeading}:date=${hasDate}`;
  }

  /**
   * Scores a structure signature based on how "article-like" it appears.
   * Higher scores indicate more likely article content vs navigation.
   */
  private scoreStructureSignature(signature: string): number {
    let score = 0;
    if (signature.includes("h=true")) {
      score += 10;
    } // Has heading - strong signal
    if (signature.includes("img=true")) {
      score += 5;
    } // Has image
    if (signature.includes("date=true")) {
      score += 5;
    } // Has date
    if (signature.startsWith("article:")) {
      score += 5;
    } // Semantic article tag
    return score;
  }

  /**
   * Groups candidates by their structure signature.
   */
  private groupCandidatesByStructure(
    candidates: z.infer<typeof LinkCandidate>[]
  ): Map<string, z.infer<typeof LinkCandidate>[]> {
    const groups = new Map<string, z.infer<typeof LinkCandidate>[]>();

    for (const candidate of candidates) {
      const signature = this.getStructureSignature(candidate.html);
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
    const sortedGroups = Array.from(groups.entries()).sort(
      ([sigA], [sigB]) =>
        this.scoreStructureSignature(sigB) - this.scoreStructureSignature(sigA)
    );

    // Take samples from the highest-scoring group
    const firstGroup = sortedGroups[0];
    if (firstGroup) {
      const [topSignature, topGroup] = firstGroup;
      if (topGroup.length > 0) {
        this.logger.debug(
          `Selected structure group: ${topSignature} (${topGroup.length} candidates, score: ${this.scoreStructureSignature(topSignature)})`
        );
        return topGroup.slice(0, maxSamples);
      }
    }

    // Fallback to first N candidates
    return candidates.slice(0, maxSamples);
  }

  /**
   * Cleans a title by collapsing whitespace (handles multi-span titles).
   */
  private cleanTitle(title: string): string {
    return title.replace(/\s+/g, " ").trim();
  }

  /**
   * Finds the anchor element that matches the target URL.
   * Handles both absolute and relative URLs.
   */
  private findTargetAnchor(doc: Document, targetUrl: string): Element | null {
    const anchors = doc.querySelectorAll("a[href]");
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      if (!href) {
        continue;
      }

      // Check if the href matches (could be relative or absolute)
      if (
        targetUrl.endsWith(href) ||
        href.endsWith(new URL(targetUrl).pathname)
      ) {
        return anchor;
      }
    }
    return null;
  }

  /**
   * Extracts a title from candidate HTML using multiple strategies.
   * Uses the candidate URL to find the specific anchor when container has multiple articles.
   */
  private extractTitle(
    html: string,
    selectors: z.infer<typeof SelectorResult>,
    candidateUrl: string
  ): string | null {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Find the specific anchor for this candidate's URL
    const targetAnchor = this.findTargetAnchor(doc, candidateUrl);

    // Strategy 1: AI-identified selector (within target anchor if found)
    if (targetAnchor) {
      const titleElement = targetAnchor.querySelector(selectors.titleSelector);
      let title = titleElement?.textContent.trim();
      if (title && title.length > 3) {
        return this.cleanTitle(title);
      }

      // Strategy 2: Anchor title attribute
      const anchorTitle = targetAnchor.getAttribute("title")?.trim();
      if (anchorTitle && anchorTitle.length > 3) {
        return this.cleanTitle(anchorTitle);
      }

      // Strategy 3: Heading inside the anchor (h1-h6)
      const heading = targetAnchor.querySelector("h1, h2, h3, h4, h5, h6");
      title = heading?.textContent.trim();
      if (title && title.length > 3) {
        return this.cleanTitle(title);
      }

      // Strategy 4: Direct anchor text
      title = targetAnchor.textContent.trim();
      if (title && title.length > 3) {
        return this.cleanTitle(title);
      }
    }

    // Fallback: Try document-level selectors if no target anchor found
    const titleElement = doc.querySelector(selectors.titleSelector);
    let title = titleElement?.textContent.trim();
    if (title && title.length > 3) {
      return this.cleanTitle(title);
    }

    const anchor = doc.querySelector("a[title]");
    title = anchor?.getAttribute("title")?.trim();
    if (title && title.length > 3) {
      return this.cleanTitle(title);
    }

    const heading = doc.querySelector("a h1, a h2, a h3, a h4, a h5, a h6");
    title = heading?.textContent.trim();
    if (title && title.length > 3) {
      return this.cleanTitle(title);
    }

    const mainAnchor = doc.querySelector("a[href]");
    title = mainAnchor?.textContent.trim();
    if (title && title.length > 3) {
      return this.cleanTitle(title);
    }

    return null;
  }

  /**
   * Parses a date from an element, checking datetime attribute first, then text content.
   */
  private parseDateFromElement(el: Element | null): string | undefined {
    if (!el) {
      return undefined;
    }
    const raw = el.getAttribute("datetime") ?? el.textContent.trim();
    return raw ? this.parseToIsoDate(raw) : undefined;
  }

  /**
   * Extracts a date from candidate HTML using multiple strategies.
   * Uses the candidate URL to find the specific anchor when container has multiple articles.
   */
  private extractDate(
    html: string,
    selectors: z.infer<typeof SelectorResult>,
    candidateUrl: string
  ): string | undefined {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Find the specific anchor for this candidate's URL
    const targetAnchor = this.findTargetAnchor(doc, candidateUrl);

    // If we found the target anchor, search within its parent container for date
    if (targetAnchor) {
      // Strategy 1: AI-identified selector within anchor
      if (selectors.dateSelector) {
        const dateEl = targetAnchor.querySelector(selectors.dateSelector);
        const date = this.parseDateFromElement(dateEl);
        if (date) {
          return date;
        }
      }

      // Strategy 2: <time> element within anchor
      const timeEl = targetAnchor.querySelector("time");
      const timeDate = this.parseDateFromElement(timeEl);
      if (timeDate) {
        return timeDate;
      }

      // Strategy 3: Element with date-related class within anchor
      const dateClassEl = targetAnchor.querySelector(
        '[class*="date"], [class*="Date"]'
      );
      const classDate = this.parseDateFromElement(dateClassEl);
      if (classDate) {
        return classDate;
      }
    }

    // Fallback: Try document-level selectors
    if (selectors.dateSelector) {
      const dateEl = doc.querySelector(selectors.dateSelector);
      const date = this.parseDateFromElement(dateEl);
      if (date) {
        return date;
      }
    }

    const timeEl = doc.querySelector("time");
    const timeDate = this.parseDateFromElement(timeEl);
    if (timeDate) {
      return timeDate;
    }

    const dateClassEl = doc.querySelector('[class*="date"], [class*="Date"]');
    const classDate = this.parseDateFromElement(dateClassEl);
    if (classDate) {
      return classDate;
    }

    return undefined;
  }

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

      if (!href || !title) {
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
      if (!href) {
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

      const container = this.findParentContainer(anchor);
      const rawHtml = container.outerHTML;
      const candidateHtml = rawHtml.replace(/\s+/g, " ").trim();

      candidates.push({ url: absoluteUrl, html: candidateHtml });
    }

    return candidates;
  }

  async identifySelectors(
    candidates: z.infer<typeof LinkCandidate>[]
  ): Promise<z.infer<typeof SelectorResult>> {
    if (candidates.length === 0) {
      throw new Error("No link candidates available for analysis");
    }

    // Select samples prioritizing article-like structures over navigation
    const sampleCandidates = this.selectSampleCandidates(candidates, 3);

    const htmlSamples = sampleCandidates
      .map((candidate, index) => {
        return `--- Sample ${index + 1} ---
URL: ${candidate.url}
HTML:
${candidate.html}`;
      })
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

  extractPublicationData(
    candidates: z.infer<typeof LinkCandidate>[],
    selectors: z.infer<typeof SelectorResult>
  ): z.infer<typeof PublicationLink>[] {
    const publications: z.infer<typeof PublicationLink>[] = [];

    for (const candidate of candidates) {
      // Use multi-strategy extraction for title and date
      // Pass the candidate URL to correctly identify the target anchor in containers with multiple articles
      const title = this.extractTitle(candidate.html, selectors, candidate.url);
      const date = this.extractDate(candidate.html, selectors, candidate.url);

      if (!title) {
        this.logger.warn(`Could not extract title for: ${candidate.url}`);
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
        this.logger.warn(
          `Validation failed for ${candidate.url}: ${result.error.message}`
        );
      }
    }

    return publications;
  }

  async identifyContentSelector(
    sampleHtml: string
  ): Promise<z.infer<typeof ContentSelectorResult>> {
    // Truncate HTML for AI analysis (keep first 50KB)
    const truncatedHtml = sampleHtml.slice(0, 50000);

    const prompt = `Analyze this HTML from a publication page and identify a CSS selector for the MAIN ARTICLE CONTENT:

${truncatedHtml}

Identify a selector that captures the article body text, excluding navigation, headers, footers, and sidebars.`;

    const response = await run(this.contentSelectorAgent, prompt);
    return ContentSelectorResult.parse(response.finalOutput);
  }

  extractContent(html: string, contentSelector: string): string | null {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const contentElements = document.querySelectorAll(contentSelector);

    if (contentElements.length === 0) {
      return null;
    }

    // Combine all matching elements and convert to markdown
    const htmlParts: string[] = [];
    for (const element of Array.from(contentElements)) {
      htmlParts.push(element.innerHTML);
    }

    const combinedHtml = htmlParts.join("\n\n");
    const markdown = this.htmlToMarkdown
      .translate(combinedHtml)
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return markdown;
  }
}
