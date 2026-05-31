import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger } from "~clients/logger";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import XLSX from "xlsx";

import { MANIFEST_FILE } from "../constants";

// === Test fixture: a tiny valid xlsx with the schema the downloader's
// post-download validation step expects (XlsxLoader). One header row + one
// data row is enough to satisfy "rows.length > 0". ==========================
const buildFixtureXlsx = (): Buffer => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [
      "Päätös pvm",
      "Saajan nimi",
      "Myöntäjä",
      "Asianumero",
      "Haettu",
      "Myönnetty",
      "EU-varat",
      "Hyväksytty käyttötarkoitus",
      "Haun nimi (asianumero)",
      "Alueet",
    ],
    [
      46022,
      "Test ry (1234567-8)",
      "Test ELY-keskus",
      "T-001",
      1000,
      800,
      "",
      "Test purpose",
      "Test programme (key-1)",
      "Test region",
    ],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

// === Playwright mock. We construct a minimal browser/page/frame tree that
// mirrors the downloader's call sequence. Tests inject failure points via
// the `behavior` argument. ==================================================
type Behavior = {
  failTabClick?: boolean;
  produceInvalidXlsx?: boolean;
  fixture: Buffer;
  discoveredSectorTexts: string[];
};

let closeMock: Mock;

const resolved = vi.fn(() => Promise.resolve());

type ChainOverrides = {
  click?: Mock;
};
const makeChainable = (overrides: ChainOverrides = {}) => {
  const chain: Record<string, unknown> = {
    click: overrides.click ?? resolved,
    waitFor: resolved,
    count: () => Promise.resolve(1),
    boundingBox: () =>
      Promise.resolve({ x: 0, y: 0, width: 1600, height: 1100 }),
    evaluate: () => Promise.resolve(),
    scrollIntoViewIfNeeded: () => Promise.resolve(),
  };
  chain.first = () => chain;
  chain.last = () => chain;
  chain.or = () => chain;
  chain.filter = () => chain;
  chain.locator = () => chain;
  return chain;
};

const buildPlaywrightMock = (behavior: Behavior) => {
  closeMock = vi.fn(() => Promise.resolve());

  const tabClick = vi.fn(() => {
    if (behavior.failTabClick) {
      return Promise.reject(new Error("simulated tab click failure"));
    }
    return Promise.resolve();
  });

  // The downloader makes two flavors of `frame.evaluate(...)`:
  //  1. Readiness check (returns boolean — anything truthy works here)
  //  2. activeElement focused-text read (used by both discoverSectors and
  //     the keyboard-nav selection path for BLANK/PUUTTUU)
  // We dispatch on the function source. The focused-text read is identified
  // by its `document.activeElement` reference; everything else falls through
  // to the readiness branch.
  //
  // `focusIndex` walks `discoveredSectorTexts` and resets to 0 every time the
  // slicer dropdown is (re-)opened — that mirrors the real listbox restarting
  // its focus at the top when the dropdown re-opens, so both the initial
  // discovery walk AND each per-sector selection walk see a fresh sequence.
  // Once the list is exhausted, the index sticks at the end so the
  // stable-threshold loop can terminate.
  let focusIndex = 0;
  const evaluate = vi.fn((fn: unknown): Promise<unknown> => {
    const src = typeof fn === "function" ? fn.toString() : String(fn);
    if (src.includes("activeElement")) {
      const texts = behavior.discoveredSectorTexts;
      const text = texts[focusIndex] ?? texts[texts.length - 1] ?? "";
      if (focusIndex < texts.length) {
        focusIndex++;
      }
      return Promise.resolve(text);
    }
    return Promise.resolve(true);
  });

  const slicerDropdownClick = vi.fn(() => {
    focusIndex = 0;
    return Promise.resolve();
  });

  const frameMock = {
    url: () => "https://app.powerbi.com/reportEmbed?reportId=demo",
    evaluate,
    waitForTimeout: resolved,
    evaluateHandle: vi.fn(() =>
      Promise.resolve({
        asElement: () => ({
          click: () => Promise.resolve(),
          boundingBox: () =>
            Promise.resolve({ x: 100, y: 200, width: 800, height: 400 }),
          scrollIntoViewIfNeeded: () => Promise.resolve(),
          evaluate: () => Promise.resolve(),
        }),
      })
    ),
    getByText: vi.fn((needle: string | RegExp) => {
      const isAvustusasiat =
        typeof needle === "string" && needle === "Avustusasiat";
      return makeChainable({
        click: isAvustusasiat ? tabClick : resolved,
      });
    }),
    locator: vi.fn((selector?: string) => {
      // Re-opening the slicer dropdown resets the listbox focus to the first
      // option in the real UI. Mirror that here so each per-sector selection
      // walk sees a fresh sequence from the top of `discoveredSectorTexts`.
      if (
        typeof selector === "string" &&
        selector.includes("Sektoriluokitus")
      ) {
        return makeChainable({ click: slicerDropdownClick });
      }
      return makeChainable();
    }),
    getByRole: vi.fn(() => makeChainable()),
  };

  const downloadMock = {
    saveAs: vi.fn((path: string) => {
      const bytes = behavior.produceInvalidXlsx
        ? Buffer.from("not a real xlsx", "utf8")
        : behavior.fixture;
      return writeFile(path, bytes);
    }),
    suggestedFilename: () => "paatokset.xlsx",
  };

  const pageMock = {
    route: vi.fn(),
    goto: resolved,
    addStyleTag: resolved,
    mouse: { move: resolved },
    waitForTimeout: resolved,
    waitForEvent: vi.fn(() => Promise.resolve(downloadMock)),
    keyboard: { press: resolved, type: resolved },
    frames: () => [frameMock as never],
    locator: vi.fn(() => ({
      boundingBox: () =>
        Promise.resolve({ x: 0, y: 0, width: 1600, height: 1100 }),
    })),
    screenshot: resolved,
  };

  const contextMock = {
    newPage: vi.fn(() => Promise.resolve(pageMock)),
  };

  return {
    chromium: {
      launch: vi.fn(() =>
        Promise.resolve({
          newContext: vi.fn(() => Promise.resolve(contextMock)),
          close: closeMock,
        })
      ),
    },
  };
};

let playwrightMock: ReturnType<typeof buildPlaywrightMock>;
vi.mock("playwright", () => ({
  get chromium() {
    return playwrightMock.chromium;
  },
}));

const silentLogger = new Logger({
  level: "error",
  useColors: false,
  useTimestamps: false,
});

describe("XlsxDownloader", () => {
  let workDir: string;
  let destDir: string;
  let fixture: Buffer;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "xlsx-downloader-test-"));
    destDir = join(workDir, "paatokset");
    fixture = buildFixtureXlsx();
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("writes one xlsx per discovered sector (incl. deep codes + blank buckets) + a manifest", async () => {
    playwrightMock = buildPlaywrightMock({
      fixture,
      discoveredSectorTexts: [
        "Valitse kaikki", // select-all control — must be skipped
        "(Tyhjä)", // blank bucket → BLANK
        "S11 Yritykset",
        "S131311 Kunnat", // 6-digit code the old \d{2,4} regex dropped
        "S15 Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt",
        "Sektoriluokitus puuttuu", // missing bucket → PUUTTUU
      ],
    });
    const { XlsxDownloader } = await import("./xlsx-downloader");

    await new XlsxDownloader({
      logger: silentLogger,
      sourceUrl: "https://example.invalid/source",
      // Production guard expects ~20 sectors; this fixture has 5. Lower
      // the bar so the happy path runs without fabricating bulk noise.
      minExpectedSectors: 1,
    }).download(destDir);

    const files = (await readdir(destDir)).sort();
    expect(files).toEqual([
      "BLANK.xlsx",
      "PUUTTUU.xlsx",
      "S11.xlsx",
      "S131311.xlsx",
      "S15.xlsx",
      MANIFEST_FILE,
    ]);

    const manifest = JSON.parse(
      await readFile(join(destDir, MANIFEST_FILE), "utf8")
    ) as { code: string; label: string }[];
    expect(manifest).toEqual([
      { code: "BLANK", label: "(Tyhjä)" },
      { code: "S11", label: "Yritykset" },
      { code: "S131311", label: "Kunnat" },
      {
        code: "S15",
        label: "Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt",
      },
      { code: "PUUTTUU", label: "Sektoriluokitus puuttuu" },
    ]);
  });

  it("aborts when discovery returns fewer than MIN_EXPECTED_SECTORS sectors", async () => {
    playwrightMock = buildPlaywrightMock({
      fixture,
      discoveredSectorTexts: ["S15 Lonely"],
    });
    const { XlsxDownloader } = await import("./xlsx-downloader");

    await expect(
      new XlsxDownloader({
        logger: silentLogger,
        sourceUrl: "https://example.invalid/source",
      }).download(destDir)
    ).rejects.toThrow(/Discovered only 1 sektoriluokitus/);

    const files = await readdir(destDir);
    expect(files).not.toContain(MANIFEST_FILE);
    expect(files).not.toContain("S15.xlsx");
  });

  it("closes the browser when navigation throws", async () => {
    playwrightMock = buildPlaywrightMock({
      fixture,
      failTabClick: true,
      discoveredSectorTexts: ["S15 Whatever"],
    });
    const { XlsxDownloader } = await import("./xlsx-downloader");

    await expect(
      new XlsxDownloader({
        logger: silentLogger,
        sourceUrl: "https://example.invalid/source",
      }).download(destDir)
    ).rejects.toThrow(/tab click failure/);

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("skips sectors whose xlsx already exists and parses", async () => {
    playwrightMock = buildPlaywrightMock({
      fixture,
      discoveredSectorTexts: [
        "S11 Yritykset",
        "S13 Julkisyhteisöt",
        "S15 NPISH",
      ],
    });
    const { XlsxDownloader } = await import("./xlsx-downloader");

    // Pre-populate S11.xlsx with the valid fixture — the downloader should
    // see it as cached and only fetch the remaining sectors.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(destDir, { recursive: true });
    await writeFile(join(destDir, "S11.xlsx"), fixture);

    await new XlsxDownloader({
      logger: silentLogger,
      sourceUrl: "https://example.invalid/source",
      minExpectedSectors: 1,
    }).download(destDir);

    const files = (await readdir(destDir)).sort();
    expect(files).toEqual(["S11.xlsx", "S13.xlsx", "S15.xlsx", MANIFEST_FILE]);
  });

  it("on validation failure: throws, manifest is not written, no temp leftovers", async () => {
    playwrightMock = buildPlaywrightMock({
      fixture,
      produceInvalidXlsx: true,
      discoveredSectorTexts: [
        "S11 Yritykset",
        "S13 Julkisyhteisöt",
        "S15 NPISH",
      ],
    });
    const { XlsxDownloader } = await import("./xlsx-downloader");

    await expect(
      new XlsxDownloader({
        logger: silentLogger,
        sourceUrl: "https://example.invalid/source",
        minExpectedSectors: 1,
      }).download(destDir)
    ).rejects.toThrow();

    const files = await readdir(destDir);
    // No manifest because the run aborted before that step.
    expect(files).not.toContain(MANIFEST_FILE);
    // No leftover *.tmp-* siblings (cleanupTemp ran on failure).
    expect(files.some((f) => f.includes(".tmp-"))).toBe(false);
  });
});
