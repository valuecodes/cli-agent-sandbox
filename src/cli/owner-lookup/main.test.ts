import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("owner-lookup main", () => {
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

  it("sets exitCode=1 when PRH client throws", async () => {
    vi.doMock("dotenv/config", () => ({}));

    vi.doMock("~utils/parse-args", () => ({
      parseArgs: () => ({ name: "Test Company Oy" }),
    }));

    vi.doMock("~clients/logger", () => ({
      Logger: class {
        info = vi.fn();
        warn = vi.fn();
        error = vi.fn();
        answer = vi.fn();
      },
    }));

    vi.doMock("./clients/prh-client", () => ({
      PrhClient: class {
        searchByName = vi.fn().mockRejectedValue(new Error("Network error"));
      },
    }));

    await import("./main");

    expect(process.exitCode).toBe(1);
  });

  it("sets exitCode=1 when no companies found", async () => {
    vi.doMock("dotenv/config", () => ({}));

    vi.doMock("~utils/parse-args", () => ({
      parseArgs: () => ({ name: "Unknown Company" }),
    }));

    vi.doMock("~clients/logger", () => ({
      Logger: class {
        info = vi.fn();
        warn = vi.fn();
        error = vi.fn();
        answer = vi.fn();
      },
    }));

    vi.doMock("./clients/prh-client", () => ({
      PrhClient: class {
        searchByName = vi
          .fn()
          .mockResolvedValue({ totalResults: 0, companies: [] });
      },
    }));

    await import("./main");

    expect(process.exitCode).toBe(1);
  });
});
