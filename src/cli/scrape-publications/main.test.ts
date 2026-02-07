import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("scrape-publications main cleanup", () => {
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

  it("closes pipeline when fetch fails", async () => {
    const closeSpy = vi.fn();
    const fetchSpy = vi.fn().mockRejectedValue(new Error("boom"));

    vi.doMock("dotenv/config", () => ({}));

    vi.doMock("~utils/parse-args", () => ({
      parseArgs: () => ({
        url: "https://example.com",
        refetch: false,
        filterUrl: undefined,
      }),
    }));

    vi.doMock("slug", () => ({
      default: (value: string) => value,
    }));

    vi.doMock("./clients/publication-pipeline", () => ({
      PublicationPipeline: class {
        fetchSourceContent = fetchSpy;
        discoverLinks = vi.fn();
        identifyAndExtractMetadata = vi.fn();
        fetchPublicationPages = vi.fn();
        extractPublicationContent = vi.fn();
        generateReviewPage = vi.fn();
        close = closeSpy;
      },
    }));

    vi.doMock("~clients/logger", () => ({
      Logger: class {
        info = vi.fn();
        warn = vi.fn();
        error = vi.fn();
      },
    }));

    vi.doMock("~utils/question-handler", () => ({
      QuestionHandler: class {
        askString = vi.fn();
      },
    }));

    await import("./main");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });
});
