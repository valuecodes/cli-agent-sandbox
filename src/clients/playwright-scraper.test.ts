import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaywrightScraper } from "./playwright-scraper";
import { Logger } from "./logger";

const { launchMock } = vi.hoisted(() => ({
  launchMock: vi.fn(),
}));

// Mock playwright
vi.mock("playwright", () => ({
  chromium: {
    launch: launchMock,
  },
}));

describe("PlaywrightScraper", () => {
  let logger: Logger;
  let browserCloseMock: ReturnType<typeof vi.fn>;
  let newPageMock: ReturnType<typeof vi.fn>;
  let isConnectedMock: ReturnType<typeof vi.fn>;
  let mockBrowser: {
    close: ReturnType<typeof vi.fn>;
    newPage: ReturnType<typeof vi.fn>;
    isConnected: ReturnType<typeof vi.fn>;
  };
  let gotoMock: ReturnType<typeof vi.fn>;
  let contentMock: ReturnType<typeof vi.fn>;
  let closePageMock: ReturnType<typeof vi.fn>;
  let waitForSelectorMock: ReturnType<typeof vi.fn>;
  let mockPage: {
    goto: ReturnType<typeof vi.fn>;
    content: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    waitForSelector: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    logger = new Logger({ level: "error" }); // Suppress logs during tests

    gotoMock = vi.fn().mockResolvedValue(undefined);
    contentMock = vi
      .fn()
      .mockResolvedValue(
        "<html><head><title>Test</title></head><body><p>Hello World</p></body></html>"
      );
    closePageMock = vi.fn().mockResolvedValue(undefined);
    waitForSelectorMock = vi.fn().mockResolvedValue(undefined);

    mockPage = {
      goto: gotoMock,
      content: contentMock,
      close: closePageMock,
      waitForSelector: waitForSelectorMock,
    };

    browserCloseMock = vi.fn().mockResolvedValue(undefined);
    newPageMock = vi.fn().mockResolvedValue(mockPage);
    isConnectedMock = vi.fn().mockReturnValue(true);

    mockBrowser = {
      close: browserCloseMock,
      newPage: newPageMock,
      isConnected: isConnectedMock,
    };

    launchMock.mockResolvedValue(mockBrowser);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("scrapeHtml", () => {
    it("launches browser and navigates to URL", async () => {
      const scraper = new PlaywrightScraper({ logger });

      await scraper.scrapeHtml("https://example.com");

      expect(launchMock).toHaveBeenCalledWith({ headless: true });
      expect(newPageMock).toHaveBeenCalled();
      expect(gotoMock).toHaveBeenCalledWith("https://example.com", {
        timeout: 30000,
        waitUntil: "load",
      });
      expect(contentMock).toHaveBeenCalled();
      expect(closePageMock).toHaveBeenCalled();

      await scraper.close();
    });

    it("returns sanitized HTML content", async () => {
      contentMock.mockResolvedValue(
        '<html><body><p>Safe content</p><script>alert("xss")</script></body></html>'
      );

      const scraper = new PlaywrightScraper({ logger });
      const html = await scraper.scrapeHtml("https://example.com");

      // Script tags should be removed by sanitization
      expect(html).not.toContain("<script>");
      expect(html).toContain("Safe content");

      await scraper.close();
    });

    it("reuses browser instance across scrapes", async () => {
      const scraper = new PlaywrightScraper({ logger });

      await scraper.scrapeHtml("https://example1.com");
      await scraper.scrapeHtml("https://example2.com");

      // Browser should only be launched once
      expect(launchMock).toHaveBeenCalledTimes(1);
      expect(newPageMock).toHaveBeenCalledTimes(2);

      await scraper.close();
    });

    it("uses custom timeout and wait strategy", async () => {
      const scraper = new PlaywrightScraper({ logger });

      await scraper.scrapeHtml("https://example.com", {
        timeoutMs: 60000,
        waitStrategy: "networkidle",
      });

      expect(gotoMock).toHaveBeenCalledWith("https://example.com", {
        timeout: 60000,
        waitUntil: "networkidle",
      });

      await scraper.close();
    });

    it("waits for selector when provided", async () => {
      const scraper = new PlaywrightScraper({ logger });

      await scraper.scrapeHtml("https://example.com", {
        waitForSelector: ".article-content",
      });

      expect(waitForSelectorMock).toHaveBeenCalledWith(".article-content", {
        timeout: 30000,
      });

      await scraper.close();
    });

    it("uses config defaults", async () => {
      const scraper = new PlaywrightScraper({
        logger,
        headless: false,
        defaultTimeoutMs: 45000,
        defaultWaitStrategy: "domcontentloaded",
      });

      await scraper.scrapeHtml("https://example.com");

      expect(launchMock).toHaveBeenCalledWith({ headless: false });
      expect(gotoMock).toHaveBeenCalledWith("https://example.com", {
        timeout: 45000,
        waitUntil: "domcontentloaded",
      });

      await scraper.close();
    });

    it("handles timeout errors", async () => {
      const timeoutError = new Error("Timeout 30000ms exceeded");
      timeoutError.name = "TimeoutError";
      gotoMock.mockRejectedValue(timeoutError);

      const scraper = new PlaywrightScraper({ logger });

      await expect(scraper.scrapeHtml("https://slow-site.com")).rejects.toThrow(
        "Timeout"
      );

      await scraper.close();
    });

    it("handles network errors", async () => {
      gotoMock.mockRejectedValue(new Error("net::ERR_CONNECTION_REFUSED"));

      const scraper = new PlaywrightScraper({ logger });

      await expect(
        scraper.scrapeHtml("https://unreachable.com")
      ).rejects.toThrow("net::ERR_CONNECTION_REFUSED");

      await scraper.close();
    });

    it("closes page even on error", async () => {
      gotoMock.mockRejectedValue(new Error("Navigation failed"));

      const scraper = new PlaywrightScraper({ logger });

      await expect(scraper.scrapeHtml("https://bad-url.com")).rejects.toThrow();
      expect(closePageMock).toHaveBeenCalled();

      await scraper.close();
    });
  });

  describe("scrapeMarkdown", () => {
    it("converts sanitized HTML to markdown", async () => {
      contentMock.mockResolvedValue(
        "<html><body><h1>Title</h1><p>Paragraph text</p></body></html>"
      );

      const scraper = new PlaywrightScraper({ logger });
      const markdown = await scraper.scrapeMarkdown("https://example.com");

      expect(markdown).toContain("Title");
      expect(markdown).toContain("Paragraph text");

      await scraper.close();
    });

    it("passes options to scrapeHtml", async () => {
      const scraper = new PlaywrightScraper({ logger });

      await scraper.scrapeMarkdown("https://example.com", {
        waitForSelector: ".content",
        timeoutMs: 5000,
      });

      expect(waitForSelectorMock).toHaveBeenCalledWith(".content", {
        timeout: 5000,
      });

      await scraper.close();
    });
  });

  describe("close", () => {
    it("closes the browser", async () => {
      const scraper = new PlaywrightScraper({ logger });

      await scraper.scrapeHtml("https://example.com");
      await scraper.close();

      expect(browserCloseMock).toHaveBeenCalled();
    });

    it("does nothing if browser was never launched", async () => {
      const scraper = new PlaywrightScraper({ logger });

      await scraper.close();

      expect(browserCloseMock).not.toHaveBeenCalled();
    });

    it("can be called multiple times safely", async () => {
      const scraper = new PlaywrightScraper({ logger });

      await scraper.scrapeHtml("https://example.com");
      await scraper.close();
      await scraper.close();

      expect(browserCloseMock).toHaveBeenCalledTimes(1);
    });

    it("relaunches browser after close", async () => {
      const scraper = new PlaywrightScraper({ logger });

      await scraper.scrapeHtml("https://example.com");
      await scraper.close();

      // Reset isConnected to simulate closed browser
      isConnectedMock.mockReturnValue(false);

      await scraper.scrapeHtml("https://example.com");

      expect(launchMock).toHaveBeenCalledTimes(2);

      await scraper.close();
    });
  });
});
