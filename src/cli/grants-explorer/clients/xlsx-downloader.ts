import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "~clients/logger";
import type { Browser, Frame, Page } from "playwright";
import { chromium } from "playwright";

import { XlsxLoader } from "./xlsx-loader";

// Selectors locked in from manual discovery on 2026-05-24 against
// https://www.tutkihallintoa.fi/valtionavustukset/tutkiavustuksia/ — the
// wrapper embeds a Power BI report (https://app.powerbi.com/reportEmbed?...)
// with isMobile=true. We strip isMobile=true via page.route so we get the
// desktop variant (slicers + per-visual overflow menu). Power BI does not
// expose tab/menuitem ARIA roles, so navigation uses text + class selectors.
//
// Filter scope: this downloader reproduces the existing tmp/paatokset.xlsx —
// the "Avustusasiat" tab with the Sektoriluokitus slicer set to
// "S15 Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt".
// Other filter scopes are out of scope (see plan / README).

const TAB_NAME = "Avustusasiat";
const SLICER_LABEL = "Sektoriluokitus";
// S15 = "Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt"
// (Non-profit institutions serving households). The slicer's search input is
// "Hae"; typing the prefix "S15" filters the virtualized list to a single
// match, which we then click.
const SECTOR_OPTION_PREFIX = "S15";

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

export type XlsxDownloaderOptions = {
  logger: Logger;
  sourceUrl: string;
};

/**
 * Downloads the Avustusasiat (S15) grants xlsx from tutkihallintoa.fi via
 * Power BI's per-visual Export menu, atomically replacing the destination
 * only if the downloaded file parses successfully through XlsxLoader.
 *
 * Contract:
 *   - Never leaves the destination in a partial state. Writes to a sibling
 *     temp file, validates by parsing, then renames over destination.
 *   - On any failure, removes the temp file and leaves destination untouched.
 *   - Always closes the browser (finally), so a hung selector doesn't leak
 *     a Chromium process.
 */
export class XlsxDownloader {
  private logger: Logger;
  private sourceUrl: string;

  constructor({ logger, sourceUrl }: XlsxDownloaderOptions) {
    this.logger = logger;
    this.sourceUrl = sourceUrl;
  }

  async download(destinationPath: string): Promise<void> {
    await mkdir(dirname(destinationPath), { recursive: true });
    const tempPath = `${destinationPath}.tmp-${Date.now()}-${randomUUID().slice(0, 8)}`;

    this.logger.info("Downloading paatokset.xlsx", {
      sourceUrl: this.sourceUrl,
      tempPath,
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
        // window. A taller viewport breaks the hover detection. The
        // export-options dialog button sits outside the viewport in this
        // mode, so we confirm via keyboard Enter (the button is autofocus).
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

      step = "slicer-filter";
      await this.applySectorFilter(report, page);

      step = "open-export";
      const download = await this.openExportAndDownload(report, page);

      step = "save";
      await download.saveAs(tempPath);
      this.logger.info("Saved download to temp path", { tempPath });

      step = "validate";
      const rows = new XlsxLoader({ logger: this.logger }).load(tempPath);
      if (rows.length === 0) {
        throw new Error("Downloaded xlsx parsed to 0 rows");
      }
      this.logger.info("Validated download", { tempPath, rows: rows.length });

      step = "rename";
      await rename(tempPath, destinationPath);
      this.logger.info("Refetched paatokset.xlsx", { destinationPath });
    } catch (error) {
      this.logger.error("XlsxDownloader failed", {
        step,
        error: error instanceof Error ? error.message : String(error),
      });
      if (page) {
        await this.debugSnapshot(page, step);
      }
      await this.cleanupTemp(tempPath);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
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
    // Wait for the page-switch to settle.
    await report.waitForTimeout(3000);
    this.logger.debug("Clicked report tab", { tab: TAB_NAME });
  }

  private async applySectorFilter(report: Frame, page: Page): Promise<void> {
    // The Sektoriluokitus slicer is a dropdown with aria-label
    // "Sektoriluokituskoodi- ja nimi" (the underlying column name). It
    // opens a virtualized list (~8 visible at a time) with a search input
    // labeled "Hae" — typing into that input filters the list to matching
    // items, which we then click.
    const dropdown = report
      .locator('[aria-label="Sektoriluokituskoodi- ja nimi"]')
      .first();
    await dropdown.waitFor({ state: "visible", timeout: 15_000 });
    await dropdown.click({ timeout: 10_000 });
    this.logger.debug("Opened slicer dropdown", { slicer: SLICER_LABEL });
    await page.waitForTimeout(1500);

    // Find the search input by enumerating all "Hae" inputs and picking the
    // visible one (only one is visible at a time — the one inside the
    // just-opened dropdown).
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
    // Click to focus, then type. fill() can race with Power BI's own
    // focus management; click+type is more robust.
    // Click to focus, then keyboard.type to enter text. Locator.fill() can
    // race with Power BI's own focus management; an explicit focus+type
    // through page.keyboard is more reliable.
    await searchEl.click();
    await page.keyboard.type(SECTOR_OPTION_PREFIX, { delay: 30 });
    this.logger.debug("Typed slicer search query", {
      query: SECTOR_OPTION_PREFIX,
    });
    await page.waitForTimeout(1500);

    // After the search filter applies, S15 should be the (only) remaining
    // option. Power BI renders options as rows in a listbox; the visible
    // text node matching the prefix is the click target.
    const option = report
      .getByText(new RegExp(`^${SECTOR_OPTION_PREFIX}\\s`))
      .first();
    await option.waitFor({ state: "visible", timeout: 10_000 });
    await option.click({ timeout: 10_000 });
    this.logger.debug("Selected sector option", {
      sector: SECTOR_OPTION_PREFIX,
    });

    // Close the dropdown so it doesn't obscure the per-visual overflow menu.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2000);
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

    // Scroll the positive-decisions visual into view so the table's
    // overflow button is positioned at a known location inside the iframe.
    await tableEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    // Hover the centre of the visual to trigger Power BI's overflow
    // chrome. Empirically, centre-hover reveals the .vcMenuBtn; top-right
    // hover does not (the buttons aren't anchored to the title bar).
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

    // .vcMenuBtn is a sibling of .visualContainer (not a child) — Power BI
    // renders visual chrome in a separate overlay layer. Since only the
    // currently-hovered visual has its button visible, an unscoped lookup
    // for the *visible* .vcMenuBtn safely targets the Myönteiset table.
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

    // Click "Vie tiedot" — this opens an export-options dialog (Mitkä
    // tiedot haluat viedä?) with format pre-selected to .xlsx and a "Vie"
    // primary button. The download fires when we click the dialog's Vie.
    const exportMenu = report.getByText(/^(Vie tiedot|Export data)/i).first();
    await exportMenu.waitFor({ state: "visible", timeout: 8_000 });
    await exportMenu.click({ timeout: 10_000 });
    this.logger.debug('Clicked "Vie tiedot" menu item');

    // Wait for the export-options dialog by its heading.
    const dialog = report
      .locator('[role="dialog"]')
      .filter({ hasText: /Mitkä tiedot haluat viedä|What data do you want/i })
      .first();
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    // Default format is already .xlsx (max 150 000 rows) — no need to
    // change it. The primary action button is "Vie" with class
    // pbi-modern-button.primaryBtn.exportButton (aria-label="Vie").
    const downloadPromise = page.waitForEvent("download", {
      timeout: DOWNLOAD_TIMEOUT_MS,
    });
    // If something below throws, downloadPromise stays unawaited and Node
    // would log an unhandled-rejection when the browser closes in finally.
    // Attach a no-op catch so the error surfaces via the thrown click error,
    // not as a separate noisy rejection.
    downloadPromise.catch(() => {
      // intentional: surface the real error from the click path below
    });
    // Invoke the dialog's "Vie" button's DOM .click() directly. Playwright's
    // user-mode click refuses to fire because the iframe is taller than the
    // viewport — the button's page-y is outside Playwright's actionability
    // window, even with force=true. The button has data-testid="export-btn".
    // A JS-level .click() bypasses positioning entirely and triggers the
    // same handler the user click would.
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
