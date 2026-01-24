import dns from "node:dns/promises";

/**
 * URL validation result returned by resolveAndValidateUrl
 */
export type UrlValidationResult = {
  valid: boolean;
  error?: string;
  resolvedIp?: string;
};

/**
 * Blocked IPv4 private/reserved ranges
 */
const BLOCKED_IPV4_PREFIXES = [
  "0.", // 0.0.0.0/8 - Current network
  "10.", // 10.0.0.0/8 - Private Class A
  "127.", // 127.0.0.0/8 - Loopback
  "169.254.", // 169.254.0.0/16 - Link-local
  "192.168.", // 192.168.0.0/16 - Private Class C
  "224.", // 224.0.0.0/4 - Multicast (224-239)
  "225.",
  "226.",
  "227.",
  "228.",
  "229.",
  "230.",
  "231.",
  "232.",
  "233.",
  "234.",
  "235.",
  "236.",
  "237.",
  "238.",
  "239.",
  "240.", // 240.0.0.0/4 - Reserved (240-255)
  "241.",
  "242.",
  "243.",
  "244.",
  "245.",
  "246.",
  "247.",
  "248.",
  "249.",
  "250.",
  "251.",
  "252.",
  "253.",
  "254.",
  "255.",
];

/**
 * Special blocked IPs
 */
const BLOCKED_IPS = new Set([
  "169.254.169.254", // AWS/GCP/Azure metadata endpoint
  "::1", // IPv6 loopback
]);

/**
 * Blocked hostnames
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

/**
 * Check if an IP address is in the 172.16.0.0/12 private range (172.16-31.x.x)
 */
const isIn172PrivateRange = (ip: string): boolean => {
  const parts = ip.split(".");
  if (parts[0] !== "172") {
    return false;
  }
  const second = parseInt(parts[1] ?? "", 10);
  return second >= 16 && second <= 31;
};

/**
 * Check if an IPv6 address is private/reserved
 */
const isPrivateIpv6 = (ip: string): boolean => {
  const lower = ip.toLowerCase();
  // Unique local addresses (fc00::/7)
  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  // Link-local addresses (fe80::/10)
  if (lower.startsWith("fe80:")) {
    return true;
  }
  // Loopback (::1)
  if (lower === "::1") {
    return true;
  }
  return false;
};

/**
 * Check if a string looks like an IP address
 */
const isIpAddress = (hostname: string): boolean => {
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  // IPv6 (simplified check - contains colons)
  if (hostname.includes(":")) {
    return true;
  }
  return false;
};

/**
 * Check if an IP address is in a private or reserved range
 */
export const isPrivateOrReservedIp = (ip: string): boolean => {
  // Check exact matches first
  if (BLOCKED_IPS.has(ip)) {
    return true;
  }

  // Check IPv6 private ranges
  if (ip.includes(":")) {
    return isPrivateIpv6(ip);
  }

  // Check IPv4 prefixes
  for (const prefix of BLOCKED_IPV4_PREFIXES) {
    if (ip.startsWith(prefix)) {
      return true;
    }
  }

  // Check 172.16-31.x.x range
  if (isIn172PrivateRange(ip)) {
    return true;
  }

  return false;
};

/**
 * Check if a hostname should be blocked
 */
export const isBlockedHostname = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();

  // Check exact matches
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return true;
  }

  // Check for .localhost suffix
  if (lower.endsWith(".localhost")) {
    return true;
  }

  // Check if hostname is actually an IP address
  if (isIpAddress(lower)) {
    return isPrivateOrReservedIp(lower);
  }

  return false;
};

/**
 * Validate that a URL uses an allowed protocol (http or https only)
 */
export const validateUrlProtocol = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Resolve a URL's hostname via DNS and validate that all resolved IPs are safe.
 * This prevents SSRF attacks by blocking requests to internal/private networks.
 */
export const resolveAndValidateUrl = async (
  urlString: string
): Promise<UrlValidationResult> => {
  // Parse URL
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Validate protocol
  if (!["http:", "https:"].includes(url.protocol)) {
    return { valid: false, error: `Blocked protocol: ${url.protocol}` };
  }

  // Check hostname blocklist
  const hostname = url.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
    return { valid: false, error: `Blocked hostname: ${hostname}` };
  }

  // Handle IP address in hostname directly
  if (isIpAddress(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      return { valid: false, error: `Blocked IP address: ${hostname}` };
    }
    return { valid: true, resolvedIp: hostname };
  }

  // DNS resolution - validate ALL resolved IPs to prevent DNS rebinding
  try {
    const addresses = await dns.resolve4(hostname);

    for (const ip of addresses) {
      if (isPrivateOrReservedIp(ip)) {
        return {
          valid: false,
          error: `Hostname resolves to blocked IP: ${ip}`,
        };
      }
    }

    return { valid: true, resolvedIp: addresses[0] };
  } catch {
    // Try IPv6 if IPv4 fails
    try {
      const addresses = await dns.resolve6(hostname);

      for (const ip of addresses) {
        if (isPrivateOrReservedIp(ip)) {
          return {
            valid: false,
            error: `Hostname resolves to blocked IPv6: ${ip}`,
          };
        }
      }

      return { valid: true, resolvedIp: addresses[0] };
    } catch {
      return { valid: false, error: `DNS resolution failed for: ${hostname}` };
    }
  }
};
