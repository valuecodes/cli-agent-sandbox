import { describe, expect, it } from "vitest";
import {
  sanitizeHtml,
  extractMainContent,
  convertToMarkdown,
  convertToPlainText,
  extractTitle,
  processHtmlContent,
} from "./html-processing";

describe("html-processing", () => {
  describe("sanitizeHtml", () => {
    it("removes script tags", () => {
      const input = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("alert");
      expect(result).toContain("Hello");
      expect(result).toContain("World");
    });

    it("removes onclick handlers", () => {
      const input = '<button onclick="alert(1)">Click me</button>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("onclick");
    });

    it("removes onerror handlers", () => {
      const input = '<img src="x" onerror="alert(1)">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("onerror");
    });

    it("removes onload handlers", () => {
      const input = '<body onload="alert(1)"><p>content</p></body>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("onload");
    });

    it("removes iframes", () => {
      const input = '<p>Before</p><iframe src="evil.com"></iframe><p>After</p>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("<iframe>");
      expect(result).not.toContain("evil.com");
    });

    it("removes style tags", () => {
      const input = "<style>.hidden { display: none; }</style><p>Content</p>";
      const result = sanitizeHtml(input);
      expect(result).not.toContain("<style>");
      expect(result).not.toContain("display: none");
    });

    it("removes object and embed tags", () => {
      const input =
        '<object data="file.swf"></object><embed src="file.swf"><p>Content</p>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("<object>");
      expect(result).not.toContain("<embed>");
    });

    it("sanitizes javascript: href", () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("javascript:");
    });

    it("sanitizes data: href", () => {
      const input = '<a href="data:text/html,<script>">Click</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain("data:");
    });

    it("allows https links", () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).toContain('href="https://example.com"');
    });

    it("allows http links", () => {
      const input = '<a href="http://example.com">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).toContain('href="http://example.com"');
    });

    it("allows mailto links", () => {
      const input = '<a href="mailto:test@example.com">Email</a>';
      const result = sanitizeHtml(input);
      expect(result).toContain('href="mailto:test@example.com"');
    });

    it("preserves safe content", () => {
      const input =
        "<h1>Title</h1><p>Paragraph with <strong>bold</strong> and <em>italic</em></p>";
      const result = sanitizeHtml(input);
      expect(result).toContain("<h1>Title</h1>");
      expect(result).toContain("<strong>bold</strong>");
      expect(result).toContain("<em>italic</em>");
    });

    it("preserves lists", () => {
      const input = "<ul><li>Item 1</li><li>Item 2</li></ul>";
      const result = sanitizeHtml(input);
      expect(result).toContain("<ul>");
      expect(result).toContain("<li>Item 1</li>");
    });

    it("preserves code blocks", () => {
      const input = "<pre><code>const x = 1;</code></pre>";
      const result = sanitizeHtml(input);
      expect(result).toContain("<pre>");
      expect(result).toContain("<code>");
      expect(result).toContain("const x = 1;");
    });

    it("preserves tables", () => {
      const input =
        "<table><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>";
      const result = sanitizeHtml(input);
      expect(result).toContain("<table>");
      expect(result).toContain("<th>Header</th>");
      expect(result).toContain("<td>Cell</td>");
    });

    it("preserves blockquotes", () => {
      const input = "<blockquote>A quote</blockquote>";
      const result = sanitizeHtml(input);
      expect(result).toContain("<blockquote>A quote</blockquote>");
    });
  });

  describe("extractMainContent", () => {
    it("extracts <main> content", () => {
      const input = `
        <html>
          <body>
            <nav>Navigation</nav>
            <main><p>Main content here</p></main>
            <footer>Footer</footer>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).toContain("Main content here");
      expect(result).not.toContain("Navigation");
      expect(result).not.toContain("Footer");
    });

    it("extracts <article> content", () => {
      const input = `
        <html>
          <body>
            <header>Header</header>
            <article><h1>Article Title</h1><p>Article content</p></article>
            <aside>Sidebar</aside>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).toContain("Article Title");
      expect(result).toContain("Article content");
      expect(result).not.toContain("Header");
      expect(result).not.toContain("Sidebar");
    });

    it("extracts [role='main'] content", () => {
      const input = `
        <html>
          <body>
            <nav>Nav</nav>
            <div role="main"><p>Role main content</p></div>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).toContain("Role main content");
      expect(result).not.toContain("Nav");
    });

    it("extracts #content element", () => {
      const input = `
        <html>
          <body>
            <div id="header">Header</div>
            <div id="content"><p>Content area</p></div>
            <div id="footer">Footer</div>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).toContain("Content area");
    });

    it("removes <nav> elements", () => {
      const input = `
        <html>
          <body>
            <nav><a href="/">Home</a></nav>
            <p>Body content</p>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).not.toContain("Home");
      expect(result).toContain("Body content");
    });

    it("removes <header> elements", () => {
      const input = `
        <html>
          <body>
            <header><h1>Site Title</h1></header>
            <p>Body content</p>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).not.toContain("Site Title");
      expect(result).toContain("Body content");
    });

    it("removes <footer> elements", () => {
      const input = `
        <html>
          <body>
            <p>Body content</p>
            <footer>Copyright 2024</footer>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).toContain("Body content");
      expect(result).not.toContain("Copyright 2024");
    });

    it("removes <aside> elements", () => {
      const input = `
        <html>
          <body>
            <p>Main content</p>
            <aside>Related articles</aside>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).toContain("Main content");
      expect(result).not.toContain("Related articles");
    });

    it("removes .sidebar class elements", () => {
      const input = `
        <html>
          <body>
            <div class="content"><p>Main</p></div>
            <div class="sidebar">Sidebar stuff</div>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).not.toContain("Sidebar stuff");
    });

    it("removes .ads class elements", () => {
      const input = `
        <html>
          <body>
            <p>Content</p>
            <div class="ads">Advertisement</div>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).not.toContain("Advertisement");
    });

    it("falls back to <body> if no main content", () => {
      const input = `
        <html>
          <body>
            <p>Just a paragraph</p>
          </body>
        </html>
      `;
      const result = extractMainContent(input);
      expect(result).toContain("Just a paragraph");
    });
  });

  describe("convertToMarkdown", () => {
    it("converts headings", () => {
      const input = "<h1>Title</h1><h2>Subtitle</h2>";
      const result = convertToMarkdown(input);
      expect(result).toContain("# Title");
      expect(result).toContain("## Subtitle");
    });

    it("converts paragraphs", () => {
      const input = "<p>First paragraph</p><p>Second paragraph</p>";
      const result = convertToMarkdown(input);
      expect(result).toContain("First paragraph");
      expect(result).toContain("Second paragraph");
    });

    it("converts unordered lists", () => {
      const input = "<ul><li>Item 1</li><li>Item 2</li></ul>";
      const result = convertToMarkdown(input);
      expect(result).toContain("- Item 1");
      expect(result).toContain("- Item 2");
    });

    it("converts ordered lists", () => {
      const input = "<ol><li>First</li><li>Second</li></ol>";
      const result = convertToMarkdown(input);
      expect(result).toContain("1. First");
      expect(result).toContain("2. Second");
    });

    it("converts links", () => {
      const input = '<a href="https://example.com">Example</a>';
      const result = convertToMarkdown(input);
      expect(result).toContain("[Example](https://example.com)");
    });

    it("converts bold text", () => {
      const input = "<strong>Bold text</strong>";
      const result = convertToMarkdown(input);
      expect(result).toContain("**Bold text**");
    });

    it("converts italic text", () => {
      const input = "<em>Italic text</em>";
      const result = convertToMarkdown(input);
      expect(result).toContain("_Italic text_");
    });

    it("converts code blocks", () => {
      const input = "<pre><code>const x = 1;</code></pre>";
      const result = convertToMarkdown(input);
      expect(result).toContain("```");
      expect(result).toContain("const x = 1;");
    });

    it("converts inline code", () => {
      const input = "<code>inline code</code>";
      const result = convertToMarkdown(input);
      expect(result).toContain("`inline code`");
    });

    it("converts blockquotes", () => {
      const input = "<blockquote>A quote</blockquote>";
      const result = convertToMarkdown(input);
      expect(result).toContain("> A quote");
    });

    it("handles nested elements", () => {
      const input = "<p>Text with <strong><em>bold and italic</em></strong></p>";
      const result = convertToMarkdown(input);
      expect(result).toContain("bold and italic");
    });
  });

  describe("convertToPlainText", () => {
    it("removes markdown links", () => {
      const input = "Check out [this link](https://example.com) here";
      const result = convertToPlainText(input);
      expect(result).toBe("Check out this link here");
    });

    it("removes markdown images", () => {
      const input = "An image: ![alt text](https://example.com/img.png)";
      const result = convertToPlainText(input);
      expect(result).toBe("An image: alt text");
    });

    it("removes bold markers", () => {
      const input = "This is **bold** text";
      const result = convertToPlainText(input);
      expect(result).toBe("This is bold text");
    });

    it("removes italic markers", () => {
      const input = "This is *italic* text";
      const result = convertToPlainText(input);
      expect(result).toBe("This is italic text");
    });

    it("removes inline code markers", () => {
      const input = "Use `const` for constants";
      const result = convertToPlainText(input);
      expect(result).toBe("Use const for constants");
    });

    it("removes heading markers", () => {
      const input = "# Heading\n\nParagraph";
      const result = convertToPlainText(input);
      expect(result).toContain("Heading");
      expect(result).not.toContain("#");
    });
  });

  describe("extractTitle", () => {
    it("extracts title from <title> tag", () => {
      const input =
        "<html><head><title>Page Title</title></head><body></body></html>";
      const result = extractTitle(input);
      expect(result).toBe("Page Title");
    });

    it("trims whitespace from title", () => {
      const input =
        "<html><head><title>  Spaced Title  </title></head><body></body></html>";
      const result = extractTitle(input);
      expect(result).toBe("Spaced Title");
    });

    it("returns null if no title", () => {
      const input = "<html><head></head><body></body></html>";
      const result = extractTitle(input);
      expect(result).toBeNull();
    });

    it("returns null for empty title", () => {
      const input = "<html><head><title></title></head><body></body></html>";
      const result = extractTitle(input);
      expect(result).toBeNull();
    });
  });

  describe("processHtmlContent", () => {
    it("returns title, markdown, and text", () => {
      const input = `
        <html>
          <head><title>Test Page</title></head>
          <body>
            <nav>Navigation</nav>
            <main>
              <h1>Main Heading</h1>
              <p>Some <strong>content</strong> here.</p>
            </main>
            <footer>Footer</footer>
          </body>
        </html>
      `;
      const result = processHtmlContent(input);

      expect(result.title).toBe("Test Page");
      expect(result.markdown).toContain("# Main Heading");
      expect(result.markdown).toContain("**content**");
      expect(result.markdown).not.toContain("Navigation");
      expect(result.markdown).not.toContain("Footer");
      expect(result.text).toContain("Main Heading");
      expect(result.text).toContain("content");
    });

    it("handles missing title gracefully", () => {
      const input = "<html><body><p>Content</p></body></html>";
      const result = processHtmlContent(input);
      expect(result.title).toBeNull();
      expect(result.markdown).toContain("Content");
    });

    it("removes scripts from output", () => {
      const input = `
        <html>
          <body>
            <p>Safe content</p>
            <script>alert('xss')</script>
          </body>
        </html>
      `;
      const result = processHtmlContent(input);
      expect(result.markdown).toContain("Safe content");
      expect(result.markdown).not.toContain("alert");
      expect(result.markdown).not.toContain("script");
    });

    it("removes iframes from output", () => {
      const input = `
        <html>
          <body>
            <p>Content</p>
            <iframe src="https://evil.com"></iframe>
          </body>
        </html>
      `;
      const result = processHtmlContent(input);
      expect(result.markdown).toContain("Content");
      expect(result.markdown).not.toContain("iframe");
      expect(result.markdown).not.toContain("evil.com");
    });

    it("removes event handlers from output", () => {
      const input = `
        <html>
          <body>
            <button onclick="alert(1)">Click me</button>
          </body>
        </html>
      `;
      const result = processHtmlContent(input);
      expect(result.markdown).not.toContain("onclick");
      expect(result.markdown).not.toContain("alert");
    });
  });
});
