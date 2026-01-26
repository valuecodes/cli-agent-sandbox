import fs from "node:fs/promises";
import path from "node:path";

import type { Logger } from "~clients/logger";
import { PlaywrightScraper } from "~clients/playwright-scraper";
import {
  resolveTmpPathForRead,
  resolveTmpPathForWrite,
} from "~tools/utils/fs";

import {
  API_CAPTURE_TIMEOUT_MS,
  ETF_CHART_PERIOD_KEY,
  ETF_CHART_PERIOD_VALUE,
  ETF_DATA_DIR,
  ETF_DATA_FILENAME,
  ETF_PROFILE_PATH,
  getEtfApiPattern,
  JUST_ETF_BASE_URL,
} from "../constants";
import type { EtfDataResponse } from "../types/etf-data";
import { EtfDataResponseSchema, isEtfDataResponse } from "../types/etf-data";

export type EtfDataFetcherConfig = {
  logger: Logger;
  headless?: boolean;
};

export type FetchResult = {
  data: EtfDataResponse;
  dataPath: string;
  fromCache: boolean;
};

/**
 * Fetches ETF data from justetf.com with caching.
 * Data is stored in ISIN-specific folders under tmp/etf-backtest/{isin}/data.json.
 */
export class EtfDataFetcher {
  private logger: Logger;
  private scraper: PlaywrightScraper;

  constructor(config: EtfDataFetcherConfig) {
    this.logger = config.logger;
    this.scraper = new PlaywrightScraper({
      logger: config.logger,
      headless: config.headless ?? true,
      defaultWaitStrategy: "domcontentloaded",
    });
  }

  /**
   * Build the relative path for cached data (relative to tmp/).
   */
  private getDataPath(isin: string): string {
    return path.join(ETF_DATA_DIR, isin, ETF_DATA_FILENAME);
  }

  /**
   * Build the justetf.com profile URL for the given ISIN.
   */
  private buildProfileUrl(isin: string): string {
    return `${JUST_ETF_BASE_URL}${ETF_PROFILE_PATH}?isin=${encodeURIComponent(isin)}`;
  }

  /**
   * Check if cached data exists for the given ISIN.
   */
  private async hasCachedData(isin: string): Promise<boolean> {
    try {
      await resolveTmpPathForRead(this.getDataPath(isin));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load cached data from disk.
   */
  private async loadCachedData(isin: string): Promise<EtfDataResponse> {
    const dataPath = await resolveTmpPathForRead(this.getDataPath(isin));
    const content = await fs.readFile(dataPath, "utf8");
    const json = JSON.parse(content) as unknown;
    return EtfDataResponseSchema.parse(json);
  }

  /**
   * Save data to disk.
   */
  private async saveData(isin: string, data: EtfDataResponse): Promise<string> {
    const dataPath = await resolveTmpPathForWrite(this.getDataPath(isin));
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2), "utf8");
    return dataPath;
  }

  /**
   * Fetch ETF data from justetf.com by navigating to the profile page
   * and intercepting the API response.
   */
  private async fetchFromWeb(isin: string): Promise<EtfDataResponse> {
    const profileUrl = this.buildProfileUrl(isin);
    this.logger.info("Fetching ETF data from justetf.com", {
      isin,
      url: profileUrl,
    });

    const result = await this.scraper.scrapeWithNetworkCapture<EtfDataResponse>({
      targetUrl: profileUrl,
      captureUrlPattern: getEtfApiPattern(isin),
      captureTimeoutMs: API_CAPTURE_TIMEOUT_MS,
      validateResponse: isEtfDataResponse,
      localStorage: {
        [ETF_CHART_PERIOD_KEY]: ETF_CHART_PERIOD_VALUE,
      },
    });

    const validated = EtfDataResponseSchema.parse(result.data);

    this.logger.info("Successfully fetched ETF data", {
      isin,
      seriesLength: validated.series.length,
      latestDate: validated.latestQuoteDate,
      capturedUrl: result.capturedUrl,
    });

    return validated;
  }

  /**
   * Fetch ETF data with caching support.
   * Returns cached data if available, unless refresh is true.
   */
  async fetch(isin: string, refresh: boolean): Promise<FetchResult> {
    const relativePath = this.getDataPath(isin);

    // Check cache unless refresh is requested
    if (!refresh && (await this.hasCachedData(isin))) {
      this.logger.info("Using cached ETF data", { isin });
      const data = await this.loadCachedData(isin);
      const dataPath = await resolveTmpPathForRead(relativePath);
      return { data, dataPath, fromCache: true };
    }

    // Fetch from web
    const data = await this.fetchFromWeb(isin);
    const dataPath = await this.saveData(isin, data);

    this.logger.info("Saved ETF data to cache", { isin, path: dataPath });

    return { data, dataPath, fromCache: false };
  }

  /**
   * Close the browser and release resources.
   */
  async close(): Promise<void> {
    await this.scraper.close();
  }
}
