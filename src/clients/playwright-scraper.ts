import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import type { Logger } from "./logger";
import {
  sanitizeHtml,
  convertToMarkdown,
} from "../tools/utils/html-processing";

/**
 * Wait strategies for page loading
 */
export type WaitStrategy = "load" | "domcontentloaded" | "networkidle";

/**
 * Configuration for the PlaywrightScraper client
 */
export type PlaywrightScraperConfig = {
  /** Logger instance for debug/info/warn/error logging */
  logger: Logger;

  /** Run browser in headless mode (default: true) */
  headless?: boolean;

  /** Default timeout in milliseconds for page operations (default: 30000) */
  defaultTimeoutMs?: number;

  /** Default wait strategy for page loads (default: "load") */
  defaultWaitStrategy?: WaitStrategy;
};

/**
 * Options for individual scrape operations
 */
export type ScrapeOptions = {
  /** Timeout in milliseconds for this specific operation */
  timeoutMs?: number;

  /** Wait strategy for this specific page load */
  waitStrategy?: WaitStrategy;

  /**
   * Optional CSS selector to wait for before extracting content.
   * Useful for SPAs that render content dynamically.
   */
  waitForSelector?: string;
};

/**
 * Parameters for individual scrape operations.
 */
export type ScrapeRequest = {
  /** URL to scrape */
  targetUrl: string;
} & ScrapeOptions;

/**
 * A web scraper client that uses Playwright to scrape webpages
 * requiring JavaScript rendering. Returns sanitized HTML or Markdown.
 */
export class PlaywrightScraper {
  private logger: Logger;
  private headless: boolean;
  private defaultTimeoutMs: number;
  private defaultWaitStrategy: WaitStrategy;
  private browser: Browser | null = null;

  constructor(config: PlaywrightScraperConfig) {
    this.logger = config.logger;
    this.headless = config.headless ?? true;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30000;
    this.defaultWaitStrategy = config.defaultWaitStrategy ?? "load";
  }

  /**
   * Get or launch the browser instance.
   * Browser is reused across scrapes for performance.
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser?.isConnected()) {
      this.logger.debug("Launching browser");
      this.browser = await chromium.launch({ headless: this.headless });
    }
    return this.browser;
  }

  /**
   * Navigate to a URL and wait for the page to be ready.
   */
  private async navigateAndWait({
    page,
    targetUrl,
    options,
  }: {
    page: Page;
    targetUrl: string;
    options: ScrapeOptions;
  }): Promise<void> {
    const timeout = options.timeoutMs ?? this.defaultTimeoutMs;
    const waitStrategy = options.waitStrategy ?? this.defaultWaitStrategy;

    this.logger.debug(`Navigating to: ${targetUrl}`);
    this.logger.debug(`Wait strategy: ${waitStrategy}, timeout: ${timeout}ms`);

    await page.goto(targetUrl, {
      timeout,
      waitUntil: waitStrategy,
    });

    if (options.waitForSelector) {
      this.logger.debug(`Waiting for selector: ${options.waitForSelector}`);
      await page.waitForSelector(options.waitForSelector, { timeout });
    }

    this.logger.debug("Page ready for content extraction");
  }

  /**
   * Scrape a URL and return sanitized HTML.
   * Uses Playwright to render JavaScript and extract the final DOM.
   */
  async scrapeHtml({ targetUrl, ...options }: ScrapeRequest): Promise<string> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await this.navigateAndWait({ page, targetUrl, options });
      const html = await page.content();
      const sanitized = sanitizeHtml(html);

      this.logger.debug(
        `Scraped and sanitized HTML (${sanitized.length} chars)`
      );
      return sanitized;
    } catch (error) {
      this.handleError({ targetUrl, error });
      throw error; // Re-throw after logging
    } finally {
      await page.close();
    }
  }

  /**
   * Scrape a URL and return Markdown.
   * Uses Playwright to render JavaScript, then sanitizes and converts to Markdown.
   */
  async scrapeMarkdown({
    targetUrl,
    ...options
  }: ScrapeRequest): Promise<string> {
    const html = await this.scrapeHtml({ targetUrl, ...options });
    const markdown = convertToMarkdown(html);

    this.logger.debug(`Converted to Markdown (${markdown.length} chars)`);
    return markdown;
  }

  /**
   * Handle and categorize errors for better debugging.
   */
  private handleError({
    targetUrl,
    error,
  }: {
    targetUrl: string;
    error: unknown;
  }): void {
    if (error instanceof Error) {
      if (error.name === "TimeoutError" || error.message.includes("Timeout")) {
        this.logger.error(
          `Timeout while scraping ${targetUrl}: ${error.message}`
        );
        return;
      }

      if (error.message.includes("net::ERR_")) {
        this.logger.error(
          `Network error scraping ${targetUrl}: ${error.message}`
        );
        return;
      }

      if (error.message.includes("Navigation failed")) {
        this.logger.error(
          `Navigation failed for ${targetUrl}: ${error.message}`
        );
        return;
      }

      this.logger.error(`Error scraping ${targetUrl}: ${error.message}`);
    } else {
      this.logger.error(`Unknown error scraping ${targetUrl}:`, error);
    }
  }

  /**
   * Close the browser and release resources.
   * MUST be called when done scraping.
   */
  async close(): Promise<void> {
    if (this.browser) {
      this.logger.debug("Closing browser");
      await this.browser.close();
      this.browser = null;
    }
  }
}
