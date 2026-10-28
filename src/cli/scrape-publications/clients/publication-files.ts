import crypto from "node:crypto";
import fs from "node:fs/promises";
import slug from "slug";

const MAX_TITLE_SLUG_LENGTH = 80;

/**
 * Checks if a file exists at the given path.
 */
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Converts a title to a URL-safe slug, truncated to MAX_TITLE_SLUG_LENGTH.
 * Falls back to "untitled-publication" when the slug would be empty.
 */
const titleToSlug = (title: string): string => {
  const baseSlug = slug(title, { lower: true });
  const trimmedSlug = baseSlug.replaceAll(/^-+|-+$/g, "");
  if (!trimmedSlug) {
    return "untitled-publication";
  }

  if (trimmedSlug.length <= MAX_TITLE_SLUG_LENGTH) {
    return trimmedSlug;
  }

  const shortened = trimmedSlug
    .slice(0, MAX_TITLE_SLUG_LENGTH)
    .replaceAll(/-+$/g, "");
  return shortened || "untitled-publication";
};

/**
 * Generates a short hash from a URL for disambiguation
 * (first 8 characters of its SHA-256 hash).
 */
const urlToShortHash = (url: string): string =>
  crypto.createHash("sha256").update(url).digest("hex").slice(0, 8);

/**
 * Keeps links containing the filter substring (all links when it is empty
 * or missing), always excluding the target URL itself.
 */
const filterLinks = (
  allLinks: string[],
  targetUrl: string,
  filterSubstring: string | undefined
): string[] =>
  (filterSubstring !== undefined && filterSubstring !== ""
    ? allLinks.filter((link) => link.includes(filterSubstring))
    : allLinks
  ).filter((link) => link !== targetUrl);

export { fileExists, filterLinks, titleToSlug, urlToShortHash };
