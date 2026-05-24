import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Logger } from "~clients/logger";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import XLSX from "xlsx";

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
};

let closeMock: Mock;

const resolved = vi.fn(() => Promise.resolve());

// A chainable noop locator/handle. Most methods return the same object so
// `.first().click()`, `.filter({...}).first().click()`, etc. all resolve.
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

  const frameMock = {
    url: () => "https://app.powerbi.com/reportEmbed?reportId=demo",
    evaluate: vi.fn(() => Promise.resolve(true)),
    waitForTimeout: resolved,
    evaluateHandle: vi.fn(() =>
      Promise.resolve({
        asElement: () => ({
          // Used by both the slicer-search input and the Myönteiset table
          // visualContainer in the downloader's call sequence.
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
    locator: vi.fn(() => makeChainable()),
    getByRole: vi.fn(() =>
      makeChainable({
        // The optional "confirm export" dialog isn't shown in tests; the
        // downloader catches this rejection and continues.
        click: vi.fn(() => Promise.reject(new Error("no confirmation dialog"))),
      })
    ),
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

// Module-scoped mock holders mutated by each test.
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
  let fixture: Buffer;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "xlsx-downloader-test-"));
    fixture = buildFixtureXlsx();
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("creates nested destination directories before writing", async () => {
    playwrightMock = buildPlaywrightMock({ fixture });
    const { XlsxDownloader } = await import("./xlsx-downloader");
    const dest = join(workDir, "nested", "deep", "paatokset.xlsx");

    await new XlsxDownloader({
      logger: silentLogger,
      sourceUrl: "https://example.invalid/source",
    }).download(dest);

    const info = await stat(dest);
    expect(info.size).toBeGreaterThan(0);
  });

  it("closes the browser when navigation throws", async () => {
    playwrightMock = buildPlaywrightMock({ fixture, failTabClick: true });
    const { XlsxDownloader } = await import("./xlsx-downloader");
    const dest = join(workDir, "paatokset.xlsx");

    await expect(
      new XlsxDownloader({
        logger: silentLogger,
        sourceUrl: "https://example.invalid/source",
      }).download(dest)
    ).rejects.toThrow(/tab click failure/);

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing destination file when validation fails", async () => {
    playwrightMock = buildPlaywrightMock({ fixture, produceInvalidXlsx: true });
    const { XlsxDownloader } = await import("./xlsx-downloader");
    const dest = join(workDir, "paatokset.xlsx");

    // Pre-populate destination with the known-good fixture bytes.
    await writeFile(dest, fixture);
    const goodBytes = await readFile(dest);

    await expect(
      new XlsxDownloader({
        logger: silentLogger,
        sourceUrl: "https://example.invalid/source",
      }).download(dest)
    ).rejects.toThrow();

    const afterBytes = await readFile(dest);
    expect(afterBytes.equals(goodBytes)).toBe(true);

    const siblings = await readdir(dirname(dest));
    expect(siblings.some((f) => f.includes(".tmp-"))).toBe(false);
  });
});
