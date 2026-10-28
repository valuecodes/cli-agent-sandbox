import { describe, expect, it, vi } from "vitest";
import { invokeTool } from "~tools/utils/test-utils";
import * as urlSafety from "~tools/utils/url-safety";

import {
  createMockResponse,
  mockLogger,
  parseResult,
  setupFetchMocks,
} from "./fetch-url-test-helpers";
import { createFetchUrlTool } from "./fetch-url-tool";

// Mock the url-safety module
vi.mock("~tools/utils/url-safety", async (importOriginal) => {
  const original = await importOriginal<typeof urlSafety>();
  return {
    ...original,
    resolveAndValidateUrl: vi.fn(),
  };
});

describe("createFetchUrlTool", () => {
  setupFetchMocks();

  describe("SSRF protection", () => {
    it("rejects localhost URLs", async () => {
      vi.mocked(urlSafety.resolveAndValidateUrl).mockResolvedValue({
        valid: false,
        error: "Blocked hostname: localhost",
      });

      const result = parseResult(
        await invokeTool<string>(createFetchUrlTool({ logger: mockLogger }), {
          url: "http://localhost/secret",
        })
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Blocked hostname");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("rejects private IP URLs", async () => {
      vi.mocked(urlSafety.resolveAndValidateUrl).mockResolvedValue({
        valid: false,
        error: "Blocked IP address: 192.168.1.1",
      });

      const result = parseResult(
        await invokeTool<string>(createFetchUrlTool({ logger: mockLogger }), {
          url: "http://192.168.1.1/admin",
        })
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Blocked IP address");
    });

    it("rejects metadata IP", async () => {
      vi.mocked(urlSafety.resolveAndValidateUrl).mockResolvedValue({
        valid: false,
        error: "Blocked IP address: 169.254.169.254",
      });

      const result = parseResult(
        await invokeTool<string>(createFetchUrlTool({ logger: mockLogger }), {
          url: "http://169.254.169.254/latest/meta-data/",
        })
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Blocked IP address");
    });

    it("re-validates redirect targets", async () => {
      // First validation passes
      vi.mocked(urlSafety.resolveAndValidateUrl)
        .mockResolvedValueOnce({ valid: true, resolvedIp: "93.184.216.34" })
        // Redirect target is blocked
        .mockResolvedValueOnce({
          valid: false,
          error: "Blocked IP address: 127.0.0.1",
        });

      vi.mocked(fetch).mockResolvedValueOnce(
        createMockResponse({
          status: 302,
          headers: { location: "http://127.0.0.1/internal" },
        })
      );

      const result = parseResult(
        await invokeTool<string>(createFetchUrlTool({ logger: mockLogger }), {
          url: "https://example.com/redirect",
        })
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Redirect blocked");
    });
  });

  describe("redirect handling", () => {
    it("follows redirects up to maxRedirects", async () => {
      // All validations pass
      vi.mocked(urlSafety.resolveAndValidateUrl).mockResolvedValue({
        valid: true,
        resolvedIp: "93.184.216.34",
      });

      // First request redirects
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          createMockResponse({
            status: 302,
            headers: { location: "https://example.com/page2" },
          })
        )
        // Second request succeeds
        .mockResolvedValueOnce(
          createMockResponse({
            status: 200,
            body: "<html><body><p>Final content</p></body></html>",
          })
        );

      const result = parseResult(
        await invokeTool<string>(createFetchUrlTool({ logger: mockLogger }), {
          url: "https://example.com/page1",
        })
      );

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.finalUrl).toBe("https://example.com/page2");
    });

    it("fails on too many redirects", async () => {
      vi.mocked(urlSafety.resolveAndValidateUrl).mockResolvedValue({
        valid: true,
        resolvedIp: "93.184.216.34",
      });

      // Always redirect
      vi.mocked(fetch).mockResolvedValue(
        createMockResponse({
          status: 302,
          headers: { location: "https://example.com/next" },
        })
      );

      const result = parseResult(
        await invokeTool<string>(createFetchUrlTool({ logger: mockLogger }), {
          url: "https://example.com/start",
          maxRedirects: 2,
        })
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Too many redirects");
    });

    it("handles redirect without location header", async () => {
      vi.mocked(urlSafety.resolveAndValidateUrl).mockResolvedValue({
        valid: true,
        resolvedIp: "93.184.216.34",
      });

      vi.mocked(fetch).mockResolvedValueOnce(
        createMockResponse({
          status: 302,
          // No location header
        })
      );

      const result = parseResult(
        await invokeTool<string>(createFetchUrlTool({ logger: mockLogger }), {
          url: "https://example.com/bad-redirect",
        })
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain("missing Location header");
    });

    it("resolves relative redirect URLs", async () => {
      vi.mocked(urlSafety.resolveAndValidateUrl).mockResolvedValue({
        valid: true,
        resolvedIp: "93.184.216.34",
      });

      vi.mocked(fetch)
        .mockResolvedValueOnce(
          createMockResponse({
            status: 302,
            headers: { location: "/relative/path" },
          })
        )
        .mockResolvedValueOnce(
          createMockResponse({
            status: 200,
            body: "<html><body>Content</body></html>",
          })
        );

      const result = parseResult(
        await invokeTool<string>(createFetchUrlTool({ logger: mockLogger }), {
          url: "https://example.com/start",
        })
      );

      expect(result.ok).toBe(true);
      expect(result.finalUrl).toBe("https://example.com/relative/path");
    });
  });
});
