import { convertToMarkdown, sanitizeHtml } from "~tools/utils/html-processing";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

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

// Options for network capture during scraping
export type NetworkCaptureOptions<T = unknown> = ScrapeOptions & {
  captureUrlPattern: RegExp; // Pattern to match API requests to capture
  captureTimeoutMs?: number; // Timeout waiting for API response (default: 15000)
  validateResponse?: (data: unknown) => data is T; // Optional validator to filter responses
  localStorage?: Record<string, string>; // Key-value pairs to set in localStorage before navigation
};

export type NetworkCaptureRequest<T = unknown> = {
  targetUrl: string;
} & NetworkCaptureOptions<T>;

export type NetworkCaptureResult<T> = {
  data: T;
  capturedUrl: string;
};

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

    this.logger.debug("Navigating to URL", { targetUrl });
    this.logger.debug("Wait strategy", {
      waitStrategy,
      timeoutMs: timeout,
    });

    await page.goto(targetUrl, {
      timeout,
      waitUntil: waitStrategy,
    });

    if (options.waitForSelector) {
      this.logger.debug("Waiting for selector", {
        selector: options.waitForSelector,
      });
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

      this.logger.debug("Scraped and sanitized HTML", {
        length: sanitized.length,
      });
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

    this.logger.debug("Converted to Markdown", { length: markdown.length });
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
        this.logger.error("Timeout while scraping", {
          targetUrl,
          message: error.message,
        });
        return;
      }

      if (error.message.includes("net::ERR_")) {
        this.logger.error("Network error scraping", {
          targetUrl,
          message: error.message,
        });
        return;
      }

      if (error.message.includes("Navigation failed")) {
        this.logger.error("Navigation failed", {
          targetUrl,
          message: error.message,
        });
        return;
      }

      this.logger.error("Error scraping", {
        targetUrl,
        message: error.message,
      });
    } else {
      this.logger.error("Unknown error scraping", { targetUrl }, error);
    }
  }

  /**
   * Scrape a URL while capturing a specific network response.
   * Sets up route interception to capture JSON responses matching the URL pattern.
   * If validateResponse is provided, only responses passing validation are captured.
   */
  async scrapeWithNetworkCapture<T>({
    targetUrl,
    captureUrlPattern,
    captureTimeoutMs = 15000,
    validateResponse,
    localStorage,
    ...options
  }: NetworkCaptureRequest<T>): Promise<NetworkCaptureResult<T>> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    // Set localStorage before any navigation if provided
    if (localStorage && Object.keys(localStorage).length > 0) {
      const entries = Object.entries(localStorage);
      this.logger.debug("Setting localStorage entries", {
        keys: entries.map(([k]) => k),
      });

      // Add init script that runs before page load to set localStorage
      await page.addInitScript((items: [string, string][]) => {
        for (const [key, value] of items) {
          window.localStorage.setItem(key, value);
        }
      }, entries);
    }

    let resolveCapture: (result: NetworkCaptureResult<T>) => void;
    let rejectCapture: (error: Error) => void;
    let captured = false;

    const capturePromise = new Promise<NetworkCaptureResult<T>>(
      (resolve, reject) => {
        resolveCapture = resolve;
        rejectCapture = reject;
      }
    );

    const captureTimeout = setTimeout(() => {
      rejectCapture(
        new Error(
          `Network capture timeout: No response matching ${captureUrlPattern.source} within ${captureTimeoutMs}ms`
        )
      );
    }, captureTimeoutMs);

    try {
      await page.route("**/*", async (route) => {
        // Skip route handling if page is closing or already captured
        if (page.isClosed()) {
          return;
        }

        const request = route.request();
        const url = request.url();

        if (captureUrlPattern.test(url) && !captured) {
          this.logger.debug("Intercepted matching request", { url });

          try {
            const response = await route.fetch();
            const body = await response.text();
            const data = JSON.parse(body) as unknown;

            // If validator provided, check if response matches expected shape
            if (validateResponse && !validateResponse(data)) {
              this.logger.debug("Response did not pass validation, skipping", {
                url,
              });
              await route.fulfill({ response });
              return;
            }

            this.logger.debug("Captured network response", {
              url,
              bodyLength: body.length,
            });

            captured = true;
            clearTimeout(captureTimeout);

            // Fulfill the route before resolving to avoid race condition
            await route.fulfill({ response });
            resolveCapture({ data: data as T, capturedUrl: url });
          } catch (err) {
            // Only continue if not already handled and page is still open
            if (!page.isClosed()) {
              this.logger.warn("Failed to capture response", {
                url,
                error: err,
              });
              try {
                await route.continue();
              } catch {
                // Route may already be handled, ignore
              }
            }
          }
        } else {
          try {
            await route.continue();
          } catch {
            // Route may already be handled or page closed, ignore
          }
        }
      });

      await this.navigateAndWait({ page, targetUrl, options });
      return await capturePromise;
    } catch (error) {
      clearTimeout(captureTimeout);
      this.handleError({ targetUrl, error });
      throw error;
    } finally {
      await page.close();
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
