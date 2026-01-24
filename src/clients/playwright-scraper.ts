import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

import {
  convertToMarkdown,
  sanitizeHtml,
} from "../tools/utils/html-processing";
import type { Logger } from "./logger";

// Possible wait strategies for page load
export type WaitStrategy = "load" | "domcontentloaded" | "networkidle";

export type PlaywrightScraperConfig = {
  logger: Logger;
  headless?: boolean; // Whether to run browser in headless mode (default: true)
  defaultTimeoutMs?: number; // Default timeout for operations in milliseconds
  defaultWaitStrategy?: WaitStrategy; // Default wait strategy
};

// Options for a single scrape operation
export type ScrapeOptions = {
  timeoutMs?: number; // Timeout in milliseconds for this specific operation
  waitStrategy?: WaitStrategy; // Page load wait strategy
  waitForSelector?: string; // CSS selector to wait for before scraping
};

export type ScrapeRequest = {
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

  /**
   * Creates a new PlaywrightScraper instance.
   * @param config - Configuration with logger and optional browser settings
   */
  constructor(config: PlaywrightScraperConfig) {
    this.logger = config.logger;
    this.headless = config.headless ?? true;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30000;
    this.defaultWaitStrategy = config.defaultWaitStrategy ?? "load";
  }

  /**
   * Get or launch the browser instance.
   * Browser is reused across scrapes for performance.
   * @returns Promise that resolves to the Browser instance
   * @throws If browser launch fails
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
   * @param page - Playwright Page instance
   * @param targetUrl - The URL to navigate to
   * @param options - Additional scrape options
   * @returns Promise that resolves when navigation and waiting is complete
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
   * @param targetUrl - The URL to scrape.
   * @param options - Additional scrape options.
   * @returns The scraped content in sanitized HTML format.
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
   * @param targetUrl - The URL to scrape.
   * @param options - Additional scrape options.
   * @returns The scraped content in Markdown format.
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
   * Logs specific messages based on error type.
   * @param targetUrl - The URL that was being scraped when the error occurred.
   * @param error - The error object caught during scraping.
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
   * @returns Promise that resolves when browser is closed
   */
  async close(): Promise<void> {
    if (this.browser) {
      this.logger.debug("Closing browser");
      await this.browser.close();
      this.browser = null;
    }
  }
}
