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

type SelectorAgent = Agent<unknown, typeof SelectorResult>;
type ContentSelectorAgent = Agent<unknown, typeof ContentSelectorResult>;

export interface PublicationScraperConfig {
  selectorAgent?: SelectorAgent;
  contentSelectorAgent?: ContentSelectorAgent;
}

export class PublicationScraper {
  private selectorAgent: SelectorAgent;
  private contentSelectorAgent: ContentSelectorAgent;
  private htmlToMarkdown: NodeHtmlMarkdown;

  constructor(config?: PublicationScraperConfig) {
    this.selectorAgent = config?.selectorAgent ?? this.createSelectorAgent();
    this.contentSelectorAgent =
      config?.contentSelectorAgent ?? this.createContentSelectorAgent();
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

      if (!href || !title) continue;

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
      if (!href) continue;

      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, baseUrl).href;
      } catch {
        continue;
      }

      if (!filterUrls.has(absoluteUrl)) continue;
      if (seenUrls.has(absoluteUrl)) continue;

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
    // Take first 3 candidates (or fewer if less available)
    const sampleCandidates = candidates.slice(0, 3);

    if (sampleCandidates.length === 0) {
      throw new Error("No link candidates available for analysis");
    }

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
      const dom = new JSDOM(candidate.html);
      const document = dom.window.document;

      // Extract title
      const titleElement = document.querySelector(selectors.titleSelector);
      const title = titleElement?.textContent.trim();

      // Extract date if selector exists
      let date: string | undefined;
      if (selectors.dateSelector) {
        const dateElement = document.querySelector(selectors.dateSelector);
        const rawDate =
          dateElement?.getAttribute("datetime") ??
          dateElement?.textContent.trim() ??
          undefined;

        if (rawDate) {
          date = this.parseToIsoDate(rawDate);
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
