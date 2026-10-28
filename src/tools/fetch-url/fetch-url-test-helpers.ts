// Shared fixtures for the fetch-url-tool test files. Each test file must still
// declare its own `vi.mock("~tools/utils/url-safety", ...)` (vi.mock is hoisted
// per file); the `urlSafety` import below then resolves to that mock.
import { afterEach, beforeEach, vi } from "vitest";
import * as urlSafety from "~tools/utils/url-safety";

import type { FetchResult } from "./fetch-url-tool";

const mockLogger = { tool: vi.fn() } as never;

// Helper to create a mock response
const createMockResponse = (options: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  ok?: boolean;
}): Response => {
  const {
    status = 200,
    headers = {},
    body = "",
    ok = status >= 200 && status < 300,
  } = options;

  const bodyBuffer = new TextEncoder().encode(body);
  let position = 0;

  const readableStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (position >= bodyBuffer.length) {
        controller.close();
        return;
      }
      // Return chunks of 1024 bytes at a time
      const chunk = bodyBuffer.slice(position, position + 1024);
      position += 1024;
      controller.enqueue(chunk);
    },
  });

  return {
    ok,
    status,
    headers: new Headers({
      "content-type": "text/html",
      ...headers,
    }),
    body: readableStream,
  } as Response;
};

// Parse the JSON result from the tool
const parseResult = (result: string): FetchResult =>
  JSON.parse(result) as FetchResult;

// Registers the per-test fetch stub and the default "URL validation passes"
// mock. Call inside the top-level describe of each test file.
const setupFetchMocks = () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());

    // Default: URL validation passes
    vi.mocked(urlSafety.resolveAndValidateUrl).mockResolvedValue({
      valid: true,
      resolvedIp: "93.184.216.34",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
};

export { mockLogger, createMockResponse, parseResult, setupFetchMocks };
