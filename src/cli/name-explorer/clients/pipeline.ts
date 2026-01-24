import fs from "node:fs/promises";
import path from "node:path";
import { Fetch } from "~clients/fetch";
import type { Logger } from "~clients/logger";

import { FETCH_DECADES } from "../constants";
import type { ConsolidatedData } from "./database";
import { AggregatedNameDatabase, NameDatabase } from "./database";
import type { ParsedNames } from "./parse-names";
import { parseNamesHtml } from "./parse-names";

export type NameSuggesterPipelineConfig = {
  logger: Logger;
  outputDir: string;
  refetch?: boolean;
};

export type { DecadeData, ConsolidatedData } from "./database";

export type FetchDecadePageResult = {
  html: string;
  markdown: string;
  parsedNames: ParsedNames;
  fromCache: boolean;
};

export type ProcessAllDecadesResult = {
  totalPages: number;
  cachedPages: number;
  fetchedPages: number;
};

export type SetupResult = {
  outputPath: string;
  totalPages: number;
  cachedPages: number;
  fetchedPages: number;
  db: NameDatabase;
  aggregatedDb: AggregatedNameDatabase | null;
};

const BASE_URL = "https://nimipalvelu.dvv.fi/suosituimmat-etunimet";
const REQUEST_DELAY_MS = 500;

export class NameSuggesterPipeline {
  private logger: Logger;
  private outputDir: string;
  private rawDataDir: string;
  private refetch: boolean;
  private fetchClient: Fetch;
  private db: NameDatabase;

  constructor(config: NameSuggesterPipelineConfig) {
    this.logger = config.logger;
    this.outputDir = config.outputDir;
    this.rawDataDir = path.join(config.outputDir, "raw");
    this.refetch = config.refetch ?? false;
    this.fetchClient = new Fetch({ logger: this.logger });
    this.db = new NameDatabase(this.logger);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateDecades(): string[] {
    return [...FETCH_DECADES];
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.rawDataDir, { recursive: true });
  }

  async fetchDecadePage({
    decade,
    page,
  }: {
    decade: string;
    page: number;
  }): Promise<FetchDecadePageResult> {
    const htmlFile = path.join(
      this.rawDataDir,
      `names-${decade}-page${page}.html`
    );
    const mdFile = path.join(this.rawDataDir, `names-${decade}-page${page}.md`);
    const jsonFile = path.join(
      this.rawDataDir,
      `names-${decade}-page${page}.json`
    );
    const url = `${BASE_URL}?vuosikymmen=${decade}&sivu=${page}`;

    const [htmlExists, mdExists] = await Promise.all([
      this.fileExists(htmlFile),
      this.fileExists(mdFile),
    ]);

    let html: string;
    let markdown: string;
    let fromCache = false;

    if (htmlExists && mdExists && !this.refetch) {
      this.logger.debug(`Cached: ${decade} page ${page}`);
      html = await fs.readFile(htmlFile, "utf-8");
      markdown = await fs.readFile(mdFile, "utf-8");
      fromCache = true;
    } else {
      this.logger.info(`Fetching ${decade} page ${page}...`);
      html = await this.fetchClient.fetchHtml(url);
      markdown = await this.fetchClient.fetchMarkdown(url);

      await Promise.all([
        fs.writeFile(htmlFile, html),
        fs.writeFile(mdFile, markdown),
      ]);

      // Delay between requests to be respectful to server
      await this.delay(REQUEST_DELAY_MS);
    }

    // Parse HTML to JSON
    const parsedNames = parseNamesHtml(html, decade);
    await fs.writeFile(jsonFile, JSON.stringify(parsedNames, null, 2));

    return { html, markdown, parsedNames, fromCache };
  }

  async processAllDecades({
    decades = this.generateDecades(),
    pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  }: {
    decades?: string[];
    pages?: number[];
  } = {}): Promise<ProcessAllDecadesResult> {
    this.logger.info(
      `Will process ${decades.length} decades × ${pages.length} pages = ${decades.length * pages.length} combinations`
    );

    let cachedPages = 0;
    let fetchedPages = 0;

    for (const decade of decades) {
      this.logger.info(`Processing decade ${decade}...`);

      for (const page of pages) {
        const { parsedNames, fromCache } = await this.fetchDecadePage({
          decade,
          page,
        });

        if (fromCache) {
          cachedPages++;
        } else {
          fetchedPages++;
        }

        // Insert parsed data into SQLite database
        this.db.insertNames(decade, "boy", parsedNames.boys);
        this.db.insertNames(decade, "girl", parsedNames.girls);
      }
    }

    return {
      totalPages: decades.length * pages.length,
      cachedPages,
      fetchedPages,
    };
  }

  async saveConsolidatedData({
    filename = "all-names.json",
  }: {
    filename?: string;
  } = {}): Promise<string> {
    const consolidatedData: ConsolidatedData = this.db.getAll();
    const outputPath = path.join(this.outputDir, filename);
    await fs.writeFile(outputPath, JSON.stringify(consolidatedData, null, 2));
    this.logger.info(`Saved consolidated data to ${outputPath}`);
    return outputPath;
  }

  async setup(): Promise<SetupResult> {
    this.logger.info("Starting name data setup...");

    await this.initialize();

    const outputPath = path.join(this.outputDir, "all-names.json");
    const jsonExists = await this.fileExists(outputPath);

    // Skip processing if JSON exists and not forcing refetch - load from JSON instead
    if (jsonExists && !this.refetch) {
      const jsonContent = await fs.readFile(outputPath, "utf-8");
      const data = JSON.parse(jsonContent) as ConsolidatedData;
      this.db.loadFromConsolidatedData(data);
      this.logger.info(
        `Loaded existing data from JSON (${this.db.getTotalCount()} records)`
      );

      const aggregatedDb = await this.loadAggregatedCsvData();

      return {
        outputPath,
        totalPages: 0,
        cachedPages: 0,
        fetchedPages: 0,
        db: this.db,
        aggregatedDb,
      };
    }

    const { totalPages, cachedPages, fetchedPages } =
      await this.processAllDecades();

    this.logger.info(
      `Processing complete: ${fetchedPages} fetched, ${cachedPages} cached, ${totalPages} total`
    );

    this.logger.info(
      `Database contains ${this.db.getTotalCount()} name records`
    );

    await this.saveConsolidatedData();

    this.logger.info("Name data setup completed.");

    const aggregatedDb = await this.loadAggregatedCsvData();

    return {
      outputPath,
      totalPages,
      cachedPages,
      fetchedPages,
      db: this.db,
      aggregatedDb,
    };
  }

  private async loadAggregatedCsvData(): Promise<AggregatedNameDatabase | null> {
    const maleCsvPath = path.join(this.outputDir, "etunimi-miehet.csv");
    const femaleCsvPath = path.join(this.outputDir, "etunimi-naiset.csv");

    const [maleExists, femaleExists] = await Promise.all([
      this.fileExists(maleCsvPath),
      this.fileExists(femaleCsvPath),
    ]);

    if (!maleExists && !femaleExists) {
      this.logger.debug("No CSV files found, skipping aggregated database");
      return null;
    }

    const aggregatedDb = new AggregatedNameDatabase(this.logger);

    if (maleExists) {
      aggregatedDb.loadFromCsv(maleCsvPath, "male");
    }

    if (femaleExists) {
      aggregatedDb.loadFromCsv(femaleCsvPath, "female");
    }

    this.logger.info(
      `Loaded aggregated CSV data (${aggregatedDb.getTotalCount()} records)`
    );

    return aggregatedDb;
  }
}
