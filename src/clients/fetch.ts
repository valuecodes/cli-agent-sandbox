import type { Logger } from "~clients/logger";
import { NodeHtmlMarkdown } from "node-html-markdown";
import sanitize from "sanitize-html";

export type FetchClientOptions = {
  logger: Logger;
};

const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: sanitize.defaults.allowedTags,
  allowedAttributes: {
    ...sanitize.defaults.allowedAttributes,
    "*": ["class", "id", "itemprop", "data-*"],
  },
};

/**
 * HTTP client for fetching and sanitizing web content.
 * Provides methods to fetch HTML and convert to markdown with sanitization.
 */
export class FetchClient {
  private logger: Logger;

  constructor({ logger }: FetchClientOptions) {
    this.logger = logger;
  }

  /**
   * Performs a GET request to the specified URL.
   * @param url - The URL to fetch
   * @returns The fetch Response object
   */
  private async get(url: string): Promise<Response> {
    this.logger.debug("Fetching URL:", url);
    const response = await fetch(url);
    this.logger.debug("Response status:", response.status);
    return response;
  }

  /**
   * Fetches a URL and converts the HTML content to sanitized markdown.
   * @param url - The URL to fetch
   * @returns Sanitized markdown content
   * @throws If the fetch fails
   */
  async fetchMarkdown(url: string): Promise<string> {
    const response = await this.get(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const html = await response.text();

    const sanitizedHtml = sanitize(html, SANITIZE_OPTIONS);

    const markdown = new NodeHtmlMarkdown().translate(sanitizedHtml);

    return markdown;
  }

  /**
   * Fetches a URL and returns sanitized HTML content.
   * @param url - The URL to fetch
   * @returns Sanitized HTML content
   * @throws If the fetch fails
   */
  async fetchHtml(url: string): Promise<string> {
    const response = await this.get(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const html = await response.text();

    return sanitize(html, SANITIZE_OPTIONS);
  }
}
