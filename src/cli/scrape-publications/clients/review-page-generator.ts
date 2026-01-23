import { marked } from "marked";
import type { z } from "zod";
import type { Publication } from "../types/index";
import type { Logger } from "../../../clients/logger";

export interface ReviewPageGeneratorConfig {
  logger: Logger;
}

export class ReviewPageGenerator {
  private logger: Logger;

  constructor(config: ReviewPageGeneratorConfig) {
    this.logger = config.logger;
  }
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  generate(
    publications: z.infer<typeof Publication>[],
    sourceUrl: string
  ): string {
    const tocItems = publications
      .map((pub, i) => {
        const dateStr = pub.date ? ` - ${pub.date}` : "";
        return `      <li><a href="#pub-${i}">${this.escapeHtml(pub.title)}</a>${dateStr}</li>`;
      })
      .join("\n");

    const articles = publications
      .map((pub, i) => {
        const dateDisplay = pub.date
          ? `<span class="date">${pub.date}</span> | `
          : "";
        const contentHtml = marked.parse(pub.content) as string;
        return `    <article id="pub-${i}" class="publication">
      <h2 class="title">${this.escapeHtml(pub.title)}</h2>
      <p class="meta">${dateDisplay}<a href="${this.escapeHtml(pub.url)}" target="_blank" rel="noopener">View Original</a></p>
      <div class="content">
        ${contentHtml}
      </div>
    </article>`;
      })
      .join("\n\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Publication Review</title>
  <style>
    :root {
      --max-width: 900px;
      --color-bg: #fafafa;
      --color-text: #333;
      --color-link: #0066cc;
      --color-border: #ddd;
      --color-code-bg: #f4f4f4;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, sans-serif;
      line-height: 1.6;
      max-width: var(--max-width);
      margin: 0 auto;
      padding: 2rem;
      background: var(--color-bg);
      color: var(--color-text);
    }
    a { color: var(--color-link); }
    header { margin-bottom: 2rem; border-bottom: 2px solid var(--color-border); padding-bottom: 1rem; }
    header h1 { margin: 0 0 0.5rem 0; }
    header .meta { color: #666; font-size: 0.9rem; }
    nav { background: white; padding: 1rem; margin-bottom: 2rem; border-radius: 4px; border: 1px solid var(--color-border); }
    nav h2 { margin: 0 0 1rem 0; font-size: 1.1rem; }
    nav ol { margin: 0; padding-left: 1.5rem; }
    nav li { margin-bottom: 0.3rem; }
    .publication { margin-bottom: 3rem; padding-bottom: 2rem; border-bottom: 1px solid var(--color-border); }
    .publication .title { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
    .publication .meta { color: #666; font-size: 0.9rem; margin-bottom: 1rem; }
    .publication .date { font-weight: 500; }
    .publication .content { background: white; padding: 1.5rem; border-radius: 4px; border: 1px solid var(--color-border); }
    .content h1, .content h2, .content h3, .content h4 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
    .content h1:first-child, .content h2:first-child, .content h3:first-child { margin-top: 0; }
    .content p { margin: 0 0 1rem 0; }
    .content ul, .content ol { margin: 0 0 1rem 0; padding-left: 1.5rem; }
    .content pre { background: var(--color-code-bg); padding: 1rem; overflow-x: auto; border-radius: 4px; }
    .content code { background: var(--color-code-bg); padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    .content pre code { background: none; padding: 0; }
    .content blockquote { border-left: 4px solid var(--color-border); margin: 0 0 1rem 0; padding-left: 1rem; color: #666; }
    .content img { max-width: 100%; height: auto; }
    .content table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
    .content th, .content td { border: 1px solid var(--color-border); padding: 0.5rem; text-align: left; }
    .content th { background: var(--color-code-bg); }
    @media (max-width: 600px) {
      body { padding: 1rem; }
      .publication .content { padding: 1rem; }
    }
    @media print {
      body { max-width: none; }
      .publication { page-break-inside: avoid; }
      nav { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Publication Review</h1>
    <p class="meta">Source: <a href="${this.escapeHtml(sourceUrl)}" target="_blank" rel="noopener">${this.escapeHtml(sourceUrl)}</a> | ${publications.length} publications | Generated: ${new Date().toISOString()}</p>
  </header>

  <nav>
    <h2>Table of Contents</h2>
    <ol>
${tocItems}
    </ol>
  </nav>

  <main>
${articles}
  </main>
</body>
</html>`;
  }
}
