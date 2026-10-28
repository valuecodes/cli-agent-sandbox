import { describe, expect, it } from "vitest";

import { extractTitle, processHtmlContent } from "./html-processing";

describe("html-processing", () => {
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
