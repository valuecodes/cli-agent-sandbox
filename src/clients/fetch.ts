import sanitize from "sanitize-html";
import { NodeHtmlMarkdown } from "node-html-markdown";

const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: sanitize.defaults.allowedTags,
  allowedAttributes: {
    ...sanitize.defaults.allowedAttributes,
    "*": ["class", "id", "itemprop", "data-*"],
  },
};

export class Fetch {
  private async get(url: string): Promise<Response> {
    const response = await fetch(url);
    return response;
  }

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

  async fetchHtml(url: string): Promise<string> {
    const response = await this.get(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const html = await response.text();

    return sanitize(html, SANITIZE_OPTIONS);
  }
}
