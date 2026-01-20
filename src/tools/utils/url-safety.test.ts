import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import dns from "node:dns/promises";
import {
  isPrivateOrReservedIp,
  isBlockedHostname,
  validateUrlProtocol,
  resolveAndValidateUrl,
} from "./url-safety";

vi.mock("node:dns/promises", () => ({
  default: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  },
}));

describe("url-safety", () => {
  describe("validateUrlProtocol", () => {
    it("allows http URLs", () => {
      expect(validateUrlProtocol("http://example.com")).toBe(true);
      expect(validateUrlProtocol("http://example.com/path")).toBe(true);
    });

    it("allows https URLs", () => {
      expect(validateUrlProtocol("https://example.com")).toBe(true);
      expect(validateUrlProtocol("https://example.com/path?query=1")).toBe(
        true
      );
    });

    it("rejects file: URLs", () => {
      expect(validateUrlProtocol("file:///etc/passwd")).toBe(false);
    });

    it("rejects javascript: URLs", () => {
      expect(validateUrlProtocol("javascript:alert(1)")).toBe(false);
    });

    it("rejects data: URLs", () => {
      expect(validateUrlProtocol("data:text/html,<script>")).toBe(false);
    });

    it("rejects ftp: URLs", () => {
      expect(validateUrlProtocol("ftp://example.com/file")).toBe(false);
    });

    it("rejects invalid URLs", () => {
      expect(validateUrlProtocol("not-a-url")).toBe(false);
      expect(validateUrlProtocol("")).toBe(false);
    });
  });

  describe("isPrivateOrReservedIp", () => {
    describe("IPv4 loopback", () => {
      it("blocks 127.0.0.1", () => {
        expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
      });

      it("blocks 127.x.x.x range", () => {
        expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIp("127.1.2.3")).toBe(true);
        expect(isPrivateOrReservedIp("127.255.255.255")).toBe(true);
      });
    });

    describe("IPv4 private Class A (10.x)", () => {
      it("blocks 10.0.0.0/8", () => {
        expect(isPrivateOrReservedIp("10.0.0.0")).toBe(true);
        expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIp("10.255.255.255")).toBe(true);
      });
    });

    describe("IPv4 private Class B (172.16-31.x)", () => {
      it("blocks 172.16.0.0/12", () => {
        expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
        expect(isPrivateOrReservedIp("172.20.0.1")).toBe(true);
        expect(isPrivateOrReservedIp("172.31.255.255")).toBe(true);
      });

      it("allows 172.15.x.x (outside range)", () => {
        expect(isPrivateOrReservedIp("172.15.0.1")).toBe(false);
      });

      it("allows 172.32.x.x (outside range)", () => {
        expect(isPrivateOrReservedIp("172.32.0.1")).toBe(false);
      });
    });

    describe("IPv4 private Class C (192.168.x)", () => {
      it("blocks 192.168.0.0/16", () => {
        expect(isPrivateOrReservedIp("192.168.0.1")).toBe(true);
        expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
        expect(isPrivateOrReservedIp("192.168.255.255")).toBe(true);
      });
    });

    describe("link-local addresses", () => {
      it("blocks 169.254.0.0/16", () => {
        expect(isPrivateOrReservedIp("169.254.0.1")).toBe(true);
        expect(isPrivateOrReservedIp("169.254.255.255")).toBe(true);
      });

      it("blocks cloud metadata IP 169.254.169.254", () => {
        expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
      });
    });

    describe("other reserved ranges", () => {
      it("blocks 0.0.0.0/8", () => {
        expect(isPrivateOrReservedIp("0.0.0.0")).toBe(true);
        expect(isPrivateOrReservedIp("0.1.2.3")).toBe(true);
      });

      it("blocks multicast 224.0.0.0/4", () => {
        expect(isPrivateOrReservedIp("224.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIp("239.255.255.255")).toBe(true);
      });

      it("blocks reserved 240.0.0.0/4", () => {
        expect(isPrivateOrReservedIp("240.0.0.1")).toBe(true);
        expect(isPrivateOrReservedIp("255.255.255.255")).toBe(true);
      });
    });

    describe("IPv6", () => {
      it("blocks IPv6 loopback ::1", () => {
        expect(isPrivateOrReservedIp("::1")).toBe(true);
      });

      it("blocks IPv6 unique local fc00::/fd00::", () => {
        expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
        expect(isPrivateOrReservedIp("fd00::1")).toBe(true);
        expect(isPrivateOrReservedIp("fd12:3456::1")).toBe(true);
      });

      it("blocks IPv6 link-local fe80::", () => {
        expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
      });
    });

    describe("public IPs", () => {
      it("allows public IP 8.8.8.8", () => {
        expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
      });

      it("allows public IP 93.184.216.34", () => {
        expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false);
      });

      it("allows public IP 1.1.1.1", () => {
        expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
      });
    });
  });

  describe("isBlockedHostname", () => {
    it("blocks localhost", () => {
      expect(isBlockedHostname("localhost")).toBe(true);
      expect(isBlockedHostname("LOCALHOST")).toBe(true);
    });

    it("blocks .localhost suffix", () => {
      expect(isBlockedHostname("foo.localhost")).toBe(true);
      expect(isBlockedHostname("bar.baz.localhost")).toBe(true);
    });

    it("blocks 127.0.0.1", () => {
      expect(isBlockedHostname("127.0.0.1")).toBe(true);
    });

    it("blocks metadata.google.internal", () => {
      expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    });

    it("blocks metadata", () => {
      expect(isBlockedHostname("metadata")).toBe(true);
    });

    it("allows example.com", () => {
      expect(isBlockedHostname("example.com")).toBe(false);
    });

    it("allows github.com", () => {
      expect(isBlockedHostname("github.com")).toBe(false);
    });
  });

  describe("resolveAndValidateUrl", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it("rejects invalid URL format", async () => {
      const result = await resolveAndValidateUrl("not-a-url");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid URL format");
    });

    it("rejects blocked protocols", async () => {
      const result = await resolveAndValidateUrl("file:///etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked protocol");
    });

    it("rejects blocked hostnames", async () => {
      const result = await resolveAndValidateUrl("http://localhost/secret");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked hostname");
    });

    it("rejects IP addresses that are private", async () => {
      const result = await resolveAndValidateUrl("http://192.168.1.1/admin");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked");
      expect(result.error).toContain("192.168.1.1");
    });

    it("allows IP addresses that are public", async () => {
      const result = await resolveAndValidateUrl("http://8.8.8.8/");
      expect(result.valid).toBe(true);
      expect(result.resolvedIp).toBe("8.8.8.8");
    });

    it("validates public URLs successfully", async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(["93.184.216.34"]);

      const result = await resolveAndValidateUrl("https://example.com/");
      expect(result.valid).toBe(true);
      expect(result.resolvedIp).toBe("93.184.216.34");
    });

    it("rejects URLs resolving to private IPs", async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(["192.168.1.1"]);

      const result = await resolveAndValidateUrl(
        "https://evil-internal.example.com/"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Hostname resolves to blocked IP");
    });

    it("validates all resolved IPs (DNS rebinding protection)", async () => {
      // Domain resolves to both public and private IPs
      vi.mocked(dns.resolve4).mockResolvedValue([
        "93.184.216.34",
        "192.168.1.1",
      ]);

      const result = await resolveAndValidateUrl(
        "https://rebinding.example.com/"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Hostname resolves to blocked IP");
    });

    it("falls back to IPv6 if IPv4 fails", async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
      vi.mocked(dns.resolve6).mockResolvedValue([
        "2606:2800:220:1:248:1893:25c8:1946",
      ]);

      const result = await resolveAndValidateUrl("https://ipv6only.example.com/");
      expect(result.valid).toBe(true);
      expect(result.resolvedIp).toBe("2606:2800:220:1:248:1893:25c8:1946");
    });

    it("rejects IPv6 private addresses", async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
      vi.mocked(dns.resolve6).mockResolvedValue(["fd00::1"]);

      const result = await resolveAndValidateUrl("https://internal.example.com/");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("blocked IPv6");
    });

    it("handles DNS resolution failures", async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENOTFOUND"));

      const result = await resolveAndValidateUrl(
        "https://nonexistent.invalid/"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS resolution failed");
    });

    it("blocks cloud metadata IP directly in URL", async () => {
      const result = await resolveAndValidateUrl(
        "http://169.254.169.254/latest/meta-data/"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Blocked");
      expect(result.error).toContain("169.254.169.254");
    });
  });
});
