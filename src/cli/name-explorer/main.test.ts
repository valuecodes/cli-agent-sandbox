import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("name-explorer main cleanup", () => {
  let restoreExitCode: (() => void) | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    restoreExitCode = () => {
      process.exitCode = previousExitCode;
    };
  });

  afterEach(() => {
    restoreExitCode?.();
    restoreExitCode = null;
  });

  it("closes databases when stats mode throws", async () => {
    const closeDb = vi.fn();
    const closeAgg = vi.fn();

    vi.doMock("dotenv/config", () => ({}));

    vi.doMock("~utils/parse-args", () => ({
      parseArgs: () => ({ refetch: false, mode: "stats" }),
    }));

    vi.doMock("./clients/pipeline", () => ({
      NameSuggesterPipeline: class {
        setup() {
          return {
            outputPath: "tmp/name-explorer/all-names.json",
            totalPages: 0,
            cachedPages: 0,
            fetchedPages: 0,
            db: { close: closeDb },
            aggregatedDb: { close: closeAgg },
          };
        }
      },
    }));

    vi.doMock("./clients/stats-generator", () => ({
      StatsGenerator: class {
        computeAll() {
          throw new Error("boom");
        }
      },
    }));

    vi.doMock("./clients/stats-page-generator", () => ({
      StatsPageGenerator: class {
        generate() {
          return "<html></html>";
        }
      },
    }));

    vi.doMock("fs/promises", () => ({
      writeFile: vi.fn(),
    }));

    vi.doMock("~clients/logger", () => ({
      Logger: class {
        info = vi.fn();
        warn = vi.fn();
        error = vi.fn();
        answer = vi.fn();
        debug = vi.fn();
      },
    }));

    await import("./main");

    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(closeAgg).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });
});
