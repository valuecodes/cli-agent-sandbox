import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Frame, Page } from "playwright";
import { chromium } from "playwright";
import type { Logger } from "~clients/logger";

import type { Sector } from "../types/schemas";
import { BLANK_CODE, MISSING_CODE } from "../utils/sector-parser";
import { writeManifest } from "./manifest";
import { DEBUG_DIR, PowerBiReportNavigator } from "./powerbi-report-navigator";
import { XlsxLoader } from "./xlsx-loader";

// The source page at https://www.tutkihallintoa.fi/valtionavustukset/tutkiavustuksia/
// embeds a Power BI report (https://app.powerbi.com/reportEmbed?...) with
// isMobile=true. We strip isMobile=true via page.route so we get the desktop
// variant (slicers + per-visual overflow menu); the report interactions live
// in PowerBiReportNavigator.
//
// Scope: this downloader iterates every Sektoriluokitus option exposed by the
// "Avustusasiat" slicer and downloads one xlsx per sector into the destination
// directory. Each file is written via a temp-name + rename so partial state is
// never visible at the final path. The sectors manifest is written last.

const COOKIE_SUPPRESS_CSS = `
  .cc-banner, .cc-banner-wrapper, .cc-window, .cc-container {
    display: none !important;
    pointer-events: none !important;
    visibility: hidden !important;
  }
`;

// Sanity guard: upstream currently exposes ~39 options (38 S-codes from S11
// down to 6-digit sub-codes like S131311, plus the BLANK and PUUTTUU sentinel
// buckets). A discovery returning many fewer than that is almost certainly a
// regression (e.g. only the top of the virtualized listbox scrolled into
// focus). 20 is well below the real count so legitimate upstream pruning
// won't false-positive, but high enough to catch a half-broken walk.
const MIN_EXPECTED_SECTORS = 20;

type XlsxDownloaderOptions = {
  logger: Logger;
  sourceUrl: string;
  // Override the discovery sanity guard. Production omits this and gets
  // MIN_EXPECTED_SECTORS; tests pass a smaller value so they don't need to
  // fabricate 20+ mock sectors per fixture.
  minExpectedSectors?: number;
};

/**
 * Downloads one xlsx per Sektoriluokitus from tutkihallintoa.fi.
 *
 * Contract:
 *   - Per-sector atomicity: each `<code>.xlsx` is written via a sibling temp
 *     file and only renamed into place after the xlsx parses successfully.
 *   - Resume-friendly: sectors whose final file already exists and parses
 *     are skipped, so re-running after a mid-loop failure only fetches the
 *     missing ones. The manifest is written only after every sector lands.
 *   - On any sector failure, throws; the browser is always closed in finally.
 */
class XlsxDownloader {
  private readonly logger: Logger;
  private readonly sourceUrl: string;
  private readonly minExpectedSectors: number;
  private readonly navigator: PowerBiReportNavigator;

  constructor({
    logger,
    sourceUrl,
    minExpectedSectors,
  }: XlsxDownloaderOptions) {
    this.logger = logger;
    this.sourceUrl = sourceUrl;
    this.minExpectedSectors = minExpectedSectors ?? MIN_EXPECTED_SECTORS;
    this.navigator = new PowerBiReportNavigator({ logger });
  }

  async download(destDir: string): Promise<void> {
    await mkdir(destDir, { recursive: true });

    this.logger.info("Starting multi-sector grants download", {
      sourceUrl: this.sourceUrl,
      destDir,
    });

    let browser: Browser | null = null;
    let page: Page | null = null;
    let step = "launch";
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        acceptDownloads: true,
        locale: "fi-FI",
        // 1100px viewport: Power BI's hover-to-reveal chrome only triggers
        // when the visual being hovered fits within the viewport scroll
        // window. The export-options dialog button sits outside the viewport
        // in this mode, so we confirm via DOM .click().
        viewport: { width: 1600, height: 1100 },
      });
      page = await context.newPage();

      await page.route("https://app.powerbi.com/reportEmbed**", (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get("isMobile") === "true") {
          url.searchParams.delete("isMobile");
          return route.continue({ url: url.toString() });
        }
        return route.continue();
      });

      step = "goto";
      await page.goto(this.sourceUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.addStyleTag({ content: COOKIE_SUPPRESS_CSS });

      step = "report-ready";
      const report = await this.navigator.waitForReportFrame({ page });

      step = "tab-click";
      await this.navigator.clickAvustusasiatTab({ report });

      // Best-effort: read the report's headline "positive decisions" count so
      // we can reconcile it against the sum of per-sector rows after download.
      const headlineTotal = await this.navigator.readDecisionHeadline({
        report,
      });

      step = "discover-sectors";
      const sectors = await this.navigator.discoverSectors({ report, page });
      this.logger.info("Discovered sektoriluokitus options", {
        count: sectors.length,
        codes: sectors.map((s) => s.code),
      });
      if (sectors.length < this.minExpectedSectors) {
        await this.navigator.debugSnapshot({
          page,
          step: "discover-sectors-undersize",
        });
        throw new Error(
          `Discovered only ${sectors.length} sektoriluokitus option(s); expected at least ${this.minExpectedSectors}. ` +
            `See ${DEBUG_DIR}/discover-sectors-undersize-*.png for the live DOM.`
        );
      }

      let loadedRows = 0;
      const obtained: Sector[] = [];
      for (const sector of sectors) {
        const destPath = join(destDir, `${sector.code}.xlsx`);
        const cachedRows = this.cachedRowCount(destPath, sector);
        if (cachedRows !== null) {
          this.logger.info("Sector xlsx already present; skipping", {
            code: sector.code,
            destPath,
            rows: cachedRows,
          });
          loadedRows += cachedRows;
          obtained.push(sector);
          continue;
        }
        step = `sector-${sector.code}`;
        try {
          loadedRows += await this.downloadOneSector(
            report,
            page,
            sector,
            destDir
          );
          obtained.push(sector);
        } catch (error) {
          // The two non-sector buckets (BLANK/PUUTTUU) are selected via a more
          // fragile path than real S-codes. If one fails, skip it rather than
          // discarding the whole run — the S-codes are the bulk, and the
          // reconciliation delta will reflect the missing bucket.
          if (sector.code === BLANK_CODE || sector.code === MISSING_CODE) {
            this.logger.warn("Skipping non-sector bucket after failure", {
              code: sector.code,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }
          throw error;
        }
      }

      step = "write-manifest";
      await writeManifest(destDir, obtained);
      this.logger.info("Wrote sectors manifest", {
        destDir,
        sectors: obtained.length,
      });

      // Reconcile: the per-sector rows are a partition of all positive
      // decisions, so their sum should match the report headline. A shortfall
      // means we missed a sector (or a bucket); we warn rather than throw so a
      // long download isn't discarded — the manifest is already written and
      // the gap is visible for follow-up.
      if (headlineTotal !== null) {
        const delta = headlineTotal - loadedRows;
        const log =
          Math.abs(delta) > Math.max(50, headlineTotal * 0.01)
            ? this.logger.warn.bind(this.logger)
            : this.logger.info.bind(this.logger);
        log("Reconciled sector rows against report headline", {
          headlineTotal,
          loadedRows,
          delta,
        });
      } else {
        this.logger.info("Loaded sector rows (headline unavailable)", {
          loadedRows,
        });
      }
    } catch (error) {
      this.logger.error("XlsxDownloader failed", {
        step,
        error: error instanceof Error ? error.message : String(error),
      });
      if (page) {
        await this.navigator.debugSnapshot({ page, step });
      }
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Row count of an already-present, parseable sector xlsx, or null when the
   * file is missing / empty / unparseable (i.e. it must be (re)downloaded).
   */
  private cachedRowCount(destPath: string, sector: Sector): number | null {
    if (!existsSync(destPath)) {
      return null;
    }
    try {
      const rows = new XlsxLoader({ logger: this.logger }).load(destPath, {
        sector,
      });
      return rows.length > 0 ? rows.length : null;
    } catch (error) {
      this.logger.warn("Cached sector xlsx failed to parse; will re-download", {
        destPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async downloadOneSector(
    report: Frame,
    page: Page,
    sector: Sector,
    destDir: string
  ): Promise<number> {
    const destPath = join(destDir, `${sector.code}.xlsx`);
    const tempPath = `${destPath}.tmp-${Date.now()}-${randomUUID().slice(0, 8)}`;

    this.logger.info("Downloading sector xlsx", {
      code: sector.code,
      tempPath,
    });

    try {
      await this.navigator.applySectorFilter({
        report,
        page,
        code: sector.code,
      });
      const download = await this.navigator.openExportAndDownload({
        report,
        page,
      });
      await download.saveAs(tempPath);
      this.logger.debug("Saved sector download to temp path", {
        code: sector.code,
        tempPath,
      });

      const rows = new XlsxLoader({ logger: this.logger }).load(tempPath, {
        sector,
      });
      if (rows.length === 0) {
        throw new Error(`Sector ${sector.code} parsed to 0 rows`);
      }

      await rename(tempPath, destPath);
      this.logger.info("Saved sector xlsx", {
        code: sector.code,
        destPath,
        rows: rows.length,
      });
      return rows.length;
    } catch (error) {
      await this.cleanupTemp(tempPath);
      throw error;
    }
  }

  private async cleanupTemp(tempPath: string): Promise<void> {
    try {
      await unlink(tempPath);
    } catch {
      // Temp file may not exist yet (e.g. failure before saveAs).
    }
  }
}

export type { XlsxDownloaderOptions };
export { XlsxDownloader };
