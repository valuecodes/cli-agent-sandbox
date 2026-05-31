import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "~clients/logger";
import type { Browser, Frame, Page } from "playwright";
import { chromium } from "playwright";

import type { Sector } from "../types/schemas";
import {
  BLANK_CODE,
  BLANK_LABEL,
  MISSING_CODE,
  MISSING_LABEL,
  parseSectorOption,
} from "../utils/sector-parser";
import { writeManifest } from "./manifest";
import { XlsxLoader } from "./xlsx-loader";

// Selectors locked in from manual discovery on 2026-05-24 against
// https://www.tutkihallintoa.fi/valtionavustukset/tutkiavustuksia/ — the
// wrapper embeds a Power BI report (https://app.powerbi.com/reportEmbed?...)
// with isMobile=true. We strip isMobile=true via page.route so we get the
// desktop variant (slicers + per-visual overflow menu). Power BI does not
// expose tab/menuitem ARIA roles, so navigation uses text + class selectors.
//
// Scope: this downloader iterates every Sektoriluokitus option exposed by the
// "Avustusasiat" slicer and downloads one xlsx per sector into the destination
// directory. Each file is written via a temp-name + rename so partial state is
// never visible at the final path. The sectors manifest is written last.

const TAB_NAME = "Avustusasiat";
const SLICER_ARIA_LABEL = "Sektoriluokituskoodi- ja nimi";
const SLICER_LABEL = "Sektoriluokitus";

const POWERBI_IFRAME_SELECTOR = 'iframe[src*="powerbi"]';
const PBI_OVERFLOW_BTN_SELECTOR = ".vcMenuBtn";
const PBI_OVERFLOW_BTN_ARIA = "Enemmän vaihtoehtoja";

const COOKIE_SUPPRESS_CSS = `
  .cc-banner, .cc-banner-wrapper, .cc-window, .cc-container {
    display: none !important;
    pointer-events: none !important;
    visibility: hidden !important;
  }
`;

const REPORT_READY_TIMEOUT_MS = 90_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const DEBUG_DIR = "tmp/grants-explorer/debug";

// Discovery: walk the slicer listbox via keyboard navigation (ArrowDown), reading
// the focused option's text each step. Power BI auto-scrolls the focused option
// into view, which is more robust than guessing a scroll-container CSS class.
// MAX_STEPS is the safety cap (well above any realistic sektoriluokitus count);
// STABLE_THRESHOLD is the number of consecutive ArrowDown presses that produce
// the same focused text before we declare "end of list".
const KEYBOARD_NAV_MAX_STEPS = 200;
// Tolerance for transient repeats: Power BI sometimes lags the activeElement
// update by more than one keyboard step, so 3 was tripping the early-exit on
// healthy lists and dropping rows mid-scroll. 10 gives generous headroom while
// MAX_STEPS still caps total runtime.
const KEYBOARD_NAV_STABLE_THRESHOLD = 10;
// Wait between ArrowDown and the next read. Empirically 80 ms was too tight
// (focus hadn't updated yet, so the next read saw the same row); 150 ms
// settles reliably without making a full 200-step walk feel slow.
const KEYBOARD_NAV_STEP_MS = 150;
// Sanity guard: upstream currently exposes ~39 options (38 S-codes from S11
// down to 6-digit sub-codes like S131311, plus the BLANK and PUUTTUU sentinel
// buckets). A discovery returning many fewer than that is almost certainly a
// regression (e.g. only the top of the virtualized listbox scrolled into
// focus). 20 is well below the real count so legitimate upstream pruning
// won't false-positive, but high enough to catch a half-broken walk.
const MIN_EXPECTED_SECTORS = 20;

export type XlsxDownloaderOptions = {
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
export class XlsxDownloader {
  private logger: Logger;
  private sourceUrl: string;
  private minExpectedSectors: number;

  constructor({
    logger,
    sourceUrl,
    minExpectedSectors,
  }: XlsxDownloaderOptions) {
    this.logger = logger;
    this.sourceUrl = sourceUrl;
    this.minExpectedSectors = minExpectedSectors ?? MIN_EXPECTED_SECTORS;
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
      const report = await this.waitForReportFrame(page);

      step = "tab-click";
      await this.clickAvustusasiatTab(report);

      // Best-effort: read the report's headline "positive decisions" count so
      // we can reconcile it against the sum of per-sector rows after download.
      const headlineTotal = await this.readDecisionHeadline(report);

      step = "discover-sectors";
      const sectors = await this.discoverSectors(report, page);
      this.logger.info("Discovered sektoriluokitus options", {
        count: sectors.length,
        codes: sectors.map((s) => s.code),
      });
      if (sectors.length < this.minExpectedSectors) {
        await this.debugSnapshot(page, "discover-sectors-undersize");
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
        await this.debugSnapshot(page, step);
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

  /**
   * Best-effort scrape of the "Myönteiset/Myönnetyt avustuspäätökset" headline
   * count (Finnish thousands separators are spaces / nbsp). Returns null if the
   * card text isn't found — reconciliation is advisory, never fatal.
   */
  private async readDecisionHeadline(report: Frame): Promise<number | null> {
    try {
      const bodyText = await report.evaluate(() => document.body.innerText);
      const match = /Myön\w+\s+avustuspäätökset\s*([\d\u00a0 ]+)/.exec(
        bodyText
      );
      const digits = match?.[1]?.replace(/\D/g, "");
      if (!digits) {
        return null;
      }
      const n = Number(digits);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
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
      await this.applySectorFilter(report, page, sector.code);
      const download = await this.openExportAndDownload(report, page);
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

  private async waitForReportFrame(page: Page): Promise<Frame> {
    const start = Date.now();
    while (Date.now() - start < REPORT_READY_TIMEOUT_MS) {
      const report = page
        .frames()
        .find((frame) => /powerbi/i.test(frame.url()));
      if (report) {
        try {
          const ready = await report.evaluate(() =>
            /Sektoriluokitus|Avustusasiat/.test(document.body.innerText)
          );
          if (ready) {
            this.logger.debug("Power BI report frame ready", {
              elapsedMs: Date.now() - start,
            });
            return report;
          }
        } catch {
          // Frame navigating; retry.
        }
      }
      await page.waitForTimeout(1000);
    }
    await this.debugSnapshot(page, "report-ready");
    throw new Error("Timed out waiting for Power BI report frame");
  }

  private async clickAvustusasiatTab(report: Frame): Promise<void> {
    const tab = report.getByText(TAB_NAME, { exact: true }).first();
    await tab.waitFor({ state: "visible", timeout: 15_000 });
    await tab.click({ timeout: 10_000 });
    await report.waitForTimeout(3000);
    this.logger.debug("Clicked report tab", { tab: TAB_NAME });
  }

  /**
   * Open the Sektoriluokitus slicer and walk every option via keyboard
   * ArrowDown, reading the focused element's text on each step. Power BI's
   * listbox auto-scrolls the focused row into view, which avoids relying on
   * a fragile scroll-container CSS class.
   */
  private async discoverSectors(report: Frame, page: Page): Promise<Sector[]> {
    const dropdown = report
      .locator(`[aria-label="${SLICER_ARIA_LABEL}"]`)
      .first();
    await dropdown.waitFor({ state: "visible", timeout: 15_000 });
    await dropdown.click({ timeout: 10_000 });
    this.logger.debug("Opened slicer dropdown for discovery", {
      slicer: SLICER_LABEL,
    });
    await page.waitForTimeout(1500);

    const readFocused = (): Promise<string> =>
      report.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) {
          return "";
        }
        // innerText is always a string but can be empty (e.g. icon-only rows);
        // fall back to aria-label so checkbox-style options still report a name.
        const text = el.innerText.trim();
        if (text) {
          return text;
        }
        return (el.getAttribute("aria-label") ?? "").trim();
      });

    // Seed: ArrowDown from the search input moves focus into the listbox onto
    // its first option. Generous initial settle (focus crosses widget boundary).
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(KEYBOARD_NAV_STEP_MS * 2);

    // Dedupe by sector code. Stability is measured on the *focused text* (not
    // on map growth): when ArrowDown stops moving focus we hit the bottom row
    // ("Sektoriluokitus puuttuu") and keep reading the same text — that's the
    // end-of-list signal.
    const byCode = new Map<string, Sector>();
    let stable = 0;
    let lastFocused = "";

    const ingest = (focused: string): void => {
      const sector = parseSectorOption(focused);
      if (sector && !byCode.has(sector.code)) {
        byCode.set(sector.code, sector);
      }
      stable = focused !== "" && focused === lastFocused ? stable + 1 : 0;
      lastFocused = focused;
    };

    // Capture the seeded position before we start pressing further — otherwise
    // the first ArrowDown inside the loop would advance past option #1.
    ingest(await readFocused());

    for (
      let i = 0;
      i < KEYBOARD_NAV_MAX_STEPS && stable < KEYBOARD_NAV_STABLE_THRESHOLD;
      i++
    ) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(KEYBOARD_NAV_STEP_MS);
      ingest(await readFocused());
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    return Array.from(byCode.values());
  }

  /**
   * Apply the sektoriluokitus filter for a single code. Power BI's slicer
   * search input persists its value across open/close cycles, so we always
   * clear it before navigating — otherwise a stale "S15" query would still
   * filter the listbox when BLANK's keyboard walk runs.
   *
   * Three option shapes are handled:
   *  - real S-codes: type the code, click the row whose text starts with it
   *    (fast — the search narrows the list to a single row);
   *  - BLANK/PUUTTUU: walk the listbox via keyboard ArrowDown until the
   *    focused row's text matches the target label, then click the focused
   *    element. `getByText` proved fragile here: substring matching against
   *    "(Tyhjä)" finds zero elements, since the row's whole-element text
   *    doesn't normalize to the bare label.
   *
   * The whole selection block runs in try/finally: Escape always fires, even
   * if selection throws. Otherwise a failed selection leaves the dropdown
   * open and the next sector's dropdown.click() toggles it closed — making
   * its 'Hae' visibility check fail and aborting the whole run.
   */
  private async applySectorFilter(
    report: Frame,
    page: Page,
    code: string
  ): Promise<void> {
    const dropdown = report
      .locator(`[aria-label="${SLICER_ARIA_LABEL}"]`)
      .first();
    await dropdown.waitFor({ state: "visible", timeout: 15_000 });
    await dropdown.click({ timeout: 10_000 });
    this.logger.debug("Opened slicer dropdown", { code });
    await page.waitForTimeout(1500);

    try {
      const searchHandle = await report.evaluateHandle(() => {
        const inputs = [
          ...document.querySelectorAll<HTMLInputElement>(
            'input[aria-label="Hae"], input[placeholder="Hae"]'
          ),
        ];
        return (
          inputs.find((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }) ?? null
        );
      });
      const searchEl = searchHandle.asElement();
      if (!searchEl) {
        throw new Error(
          "No visible 'Hae' search input found after opening slicer dropdown"
        );
      }

      await searchEl.click();
      // Clear any prior search query so a stale filter from the previous
      // sector doesn't shrink the listbox under our keyboard walk.
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(200);

      if (code === BLANK_CODE) {
        await this.selectOptionByKeyboard(report, page, BLANK_LABEL);
      } else if (code === MISSING_CODE) {
        await this.selectOptionByKeyboard(report, page, MISSING_LABEL);
      } else {
        await page.keyboard.type(code, { delay: 30 });
        await page.waitForTimeout(1500);
        // Anchor on "<code> " (trailing space) so e.g. "S1313" doesn't also
        // match "S131311" — the prefix collision the deeper sub-codes create.
        const option = report.getByText(new RegExp(`^${code}\\s`)).first();
        await option.waitFor({ state: "visible", timeout: 10_000 });
        await option.click({ timeout: 10_000 });
      }
      this.logger.debug("Selected sector option", { code });
    } finally {
      // Always close the dropdown — even on failure — so the next sector
      // opens a clean slicer rather than toggling this one shut.
      await page.keyboard.press("Escape").catch(() => {
        // intentional: don't mask the original selection error
      });
      await page.waitForTimeout(2000);
    }
  }

  /**
   * Walk the (already-open) slicer listbox with ArrowDown until the focused
   * row's `innerText` exactly matches `targetLabel`, then click the focused
   * element. Reuses the same focus-stability mechanism as `discoverSectors`:
   * after KEYBOARD_NAV_STABLE_THRESHOLD consecutive identical reads we
   * conclude the target isn't in the list and throw.
   */
  private async selectOptionByKeyboard(
    report: Frame,
    page: Page,
    targetLabel: string
  ): Promise<void> {
    // Seed focus into the listbox (ArrowDown from the search input crosses
    // the widget boundary onto the first option).
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(KEYBOARD_NAV_STEP_MS * 2);

    const readFocused = (): Promise<string> =>
      report.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) {
          return "";
        }
        const text = el.innerText.trim();
        if (text) {
          return text;
        }
        return (el.getAttribute("aria-label") ?? "").trim();
      });

    let lastFocused = "";
    let stable = 0;

    for (
      let i = 0;
      i < KEYBOARD_NAV_MAX_STEPS && stable < KEYBOARD_NAV_STABLE_THRESHOLD;
      i++
    ) {
      const focused = await readFocused();
      if (focused === targetLabel) {
        const handle = await report.evaluateHandle(
          () => document.activeElement
        );
        const element = handle.asElement();
        if (!element) {
          throw new Error(
            `Focused element vanished while selecting "${targetLabel}"`
          );
        }
        await element.click({ timeout: 10_000 });
        await page.waitForTimeout(500);
        return;
      }
      stable = focused !== "" && focused === lastFocused ? stable + 1 : 0;
      lastFocused = focused;
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(KEYBOARD_NAV_STEP_MS);
    }

    throw new Error(
      `Option "${targetLabel}" not found via keyboard navigation`
    );
  }

  private async openExportAndDownload(report: Frame, page: Page) {
    // The Avustusasiat page renders two data tables: "Myönteiset päätökset"
    // (positive grant decisions — what we want, matches paatokset.xlsx) and
    // "Kielteiset päätökset" (negative decisions, below). Both expose a
    // per-visual overflow button (.vcMenuBtn / aria "Enemmän vaihtoehtoja")
    // when hovered. We must target the *positive* visual specifically.
    const POSITIVE_TABLE_LABEL_PREFIX = "Myönteiset päätökset";
    const tableHandle = await report.evaluateHandle((prefix: string) => {
      const visuals = [...document.querySelectorAll(".visualContainer")];
      return (
        visuals.find((el) =>
          (el.getAttribute("aria-label") ?? "").startsWith(prefix)
        ) ?? null
      );
    }, POSITIVE_TABLE_LABEL_PREFIX);
    const tableEl = tableHandle.asElement();
    if (!tableEl) {
      throw new Error(
        `Could not locate "${POSITIVE_TABLE_LABEL_PREFIX}" visual on Avustusasiat`
      );
    }

    await tableEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    const box = await tableEl.boundingBox();
    if (!box) {
      throw new Error("Positive-decisions table has no bounding box");
    }
    const iframeBox = await page.locator(POWERBI_IFRAME_SELECTOR).boundingBox();
    if (!iframeBox) {
      throw new Error("Power BI iframe has no bounding box");
    }
    await page.mouse.move(
      iframeBox.x + box.x + box.width / 2,
      iframeBox.y + box.y + box.height / 2,
      { steps: 5 }
    );
    await page.waitForTimeout(1500);

    const overflow = report
      .locator(
        `${PBI_OVERFLOW_BTN_SELECTOR}, [aria-label="${PBI_OVERFLOW_BTN_ARIA}"]`
      )
      .first();
    await overflow.waitFor({ state: "visible", timeout: 10_000 });
    await overflow.click({ timeout: 10_000, force: true });
    this.logger.debug("Opened per-visual overflow menu", {
      visual: POSITIVE_TABLE_LABEL_PREFIX,
    });
    await page.waitForTimeout(1000);

    const exportMenu = report.getByText(/^(Vie tiedot|Export data)/i).first();
    await exportMenu.waitFor({ state: "visible", timeout: 8_000 });
    await exportMenu.click({ timeout: 10_000 });
    this.logger.debug('Clicked "Vie tiedot" menu item');

    const dialog = report
      .locator('[role="dialog"]')
      .filter({ hasText: /Mitkä tiedot haluat viedä|What data do you want/i })
      .first();
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    const downloadPromise = page.waitForEvent("download", {
      timeout: DOWNLOAD_TIMEOUT_MS,
    });
    downloadPromise.catch(() => {
      // intentional: surface the real error from the click path below
    });
    const exportConfirm = dialog
      .locator(
        'button[data-testid="export-btn"], button[aria-label="Vie"], button.exportButton.primaryBtn'
      )
      .first();
    await exportConfirm.waitFor({ state: "attached", timeout: 5_000 });
    await exportConfirm.evaluate((el) => {
      (el as HTMLElement).click();
    });
    this.logger.debug("Confirmed export dialog via DOM click");

    const download = await downloadPromise;
    this.logger.debug("Download event received", {
      suggestedFilename: download.suggestedFilename(),
    });
    return download;
  }

  private async debugSnapshot(page: Page, step: string): Promise<void> {
    try {
      await mkdir(DEBUG_DIR, { recursive: true });
      const path = `${DEBUG_DIR}/${step}-${Date.now()}.png`;
      await page.screenshot({ path, fullPage: false });
      this.logger.warn("Saved debug screenshot", { step, path });
    } catch (error) {
      this.logger.debug("Failed to write debug screenshot", {
        step,
        error: error instanceof Error ? error.message : String(error),
      });
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
