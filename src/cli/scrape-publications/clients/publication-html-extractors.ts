import { JSDOM } from "jsdom";
import type { z } from "zod";

import type { SelectorResult } from "../types/publication";

const isNonEmpty = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value !== "";

/**
 * Parses various date formats to ISO format (YYYY-MM-DD).
 * @returns ISO date string or undefined if parsing fails
 */
const parseToIsoDate = (rawDate: string): string | undefined => {
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return rawDate;
  }

  // MM.DD.YY format (e.g., "01.15.26")
  const dotFormat = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(rawDate);
  const [, dotMonth, dotDay, dotYear] = dotFormat ?? [];
  if (isNonEmpty(dotMonth) && isNonEmpty(dotDay) && isNonEmpty(dotYear)) {
    const fullYear =
      Number.parseInt(dotYear, 10) > 50 ? `19${dotYear}` : `20${dotYear}`;
    return `${fullYear}-${dotMonth}-${dotDay}`;
  }

  // MM/DD/YYYY or MM-DD-YYYY format
  const slashFormat = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(rawDate);
  const [, slashMonth, slashDay, slashYear] = slashFormat ?? [];
  if (isNonEmpty(slashMonth) && isNonEmpty(slashDay) && isNonEmpty(slashYear)) {
    return `${slashYear}-${slashMonth}-${slashDay}`;
  }

  return undefined;
};

/**
 * Finds the parent container element for an anchor (article card, list item, etc.).
 * @returns The container element or the anchor's parent as fallback
 */
const findParentContainer = (anchor: Element): Element => {
  const containerTags = ["LI", "ARTICLE", "DIV", "SECTION", "TR", "DD"];
  let container: Element | null = anchor.parentElement;

  while (container && !containerTags.includes(container.tagName)) {
    container = container.parentElement;
  }

  // Fall back to parent if no suitable container found
  return container ?? anchor.parentElement ?? anchor;
};

/**
 * Creates a structure signature for an HTML snippet based on its structural features.
 * Used to group similar HTML structures together for better sampling.
 */
const getStructureSignature = (html: string): string => {
  const dom = new JSDOM(html);
  const root = dom.window.document.body.firstElementChild;
  if (!root) {
    return "unknown";
  }

  const tag = root.tagName.toLowerCase();
  const hasImage = root.querySelector("img") !== null;
  const hasHeading = root.querySelector("h1, h2, h3, h4, h5, h6") !== null;
  const hasDate =
    root.querySelector('time, [class*="date"], [class*="Date"]') !== null;

  return `${tag}:img=${hasImage}:h=${hasHeading}:date=${hasDate}`;
};

/**
 * Scores a structure signature based on how "article-like" it appears.
 * Higher scores indicate more likely article content vs navigation.
 */
const scoreStructureSignature = (signature: string): number => {
  let score = 0;
  if (signature.includes("h=true")) {
    score += 10;
  } // Has heading - strong signal
  if (signature.includes("img=true")) {
    score += 5;
  } // Has image
  if (signature.includes("date=true")) {
    score += 5;
  } // Has date
  if (signature.startsWith("article:")) {
    score += 5;
  } // Semantic article tag
  return score;
};

/**
 * Cleans a title by collapsing whitespace (handles multi-span titles).
 */
const cleanTitle = (title: string): string =>
  title.replaceAll(/\s+/g, " ").trim();

/**
 * Finds the anchor element that matches the target URL.
 * Handles both absolute and relative URLs.
 */
const findTargetAnchor = (doc: Document, targetUrl: string): Element | null => {
  const anchors = doc.querySelectorAll("a[href]");
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (href === null || href === "") {
      continue;
    }

    // Check if the href matches (could be relative or absolute)
    if (
      targetUrl.endsWith(href) ||
      href.endsWith(new URL(targetUrl).pathname)
    ) {
      return anchor;
    }
  }
  return null;
};

/**
 * Extracts a title from candidate HTML using multiple strategies.
 * Uses the candidate URL to find the specific anchor when container has multiple articles.
 */
const extractTitle = (
  html: string,
  selectors: z.infer<typeof SelectorResult>,
  candidateUrl: string
): string | null => {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Find the specific anchor for this candidate's URL
  const targetAnchor = findTargetAnchor(doc, candidateUrl);

  // Strategy 1: AI-identified selector (within target anchor if found)
  if (targetAnchor) {
    const titleElement = targetAnchor.querySelector(selectors.titleSelector);
    let title = titleElement?.textContent.trim();
    if (title !== undefined && title.length > 3) {
      return cleanTitle(title);
    }

    // Strategy 2: Anchor title attribute
    const anchorTitle = targetAnchor.getAttribute("title")?.trim();
    if (anchorTitle !== undefined && anchorTitle.length > 3) {
      return cleanTitle(anchorTitle);
    }

    // Strategy 3: Heading inside the anchor (h1-h6)
    const heading = targetAnchor.querySelector("h1, h2, h3, h4, h5, h6");
    title = heading?.textContent.trim();
    if (title !== undefined && title.length > 3) {
      return cleanTitle(title);
    }

    // Strategy 4: Direct anchor text
    title = targetAnchor.textContent.trim();
    if (title.length > 3) {
      return cleanTitle(title);
    }
  }

  // Fallback: Try document-level selectors if no target anchor found
  const titleElement = doc.querySelector(selectors.titleSelector);
  let title = titleElement?.textContent.trim();
  if (title !== undefined && title.length > 3) {
    return cleanTitle(title);
  }

  const anchor = doc.querySelector("a[title]");
  title = anchor?.getAttribute("title")?.trim();
  if (title !== undefined && title.length > 3) {
    return cleanTitle(title);
  }

  const heading = doc.querySelector("a h1, a h2, a h3, a h4, a h5, a h6");
  title = heading?.textContent.trim();
  if (title !== undefined && title.length > 3) {
    return cleanTitle(title);
  }

  const mainAnchor = doc.querySelector("a[href]");
  title = mainAnchor?.textContent.trim();
  if (title !== undefined && title.length > 3) {
    return cleanTitle(title);
  }

  return null;
};

/**
 * Parses a date from an element, checking datetime attribute first, then text content.
 */
const parseDateFromElement = (el: Element | null): string | undefined => {
  if (!el) {
    return undefined;
  }
  const raw = el.getAttribute("datetime") ?? el.textContent.trim();
  return raw ? parseToIsoDate(raw) : undefined;
};

/**
 * Extracts a date from candidate HTML using multiple strategies.
 * Uses the candidate URL to find the specific anchor when container has multiple articles.
 */
const extractDate = (
  html: string,
  selectors: z.infer<typeof SelectorResult>,
  candidateUrl: string
): string | undefined => {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Find the specific anchor for this candidate's URL
  const targetAnchor = findTargetAnchor(doc, candidateUrl);

  // If we found the target anchor, search within its parent container for date
  if (targetAnchor) {
    // Strategy 1: AI-identified selector within anchor
    if (isNonEmpty(selectors.dateSelector)) {
      const dateEl = targetAnchor.querySelector(selectors.dateSelector);
      const date = parseDateFromElement(dateEl);
      if (isNonEmpty(date)) {
        return date;
      }
    }

    // Strategy 2: <time> element within anchor
    const timeEl = targetAnchor.querySelector("time");
    const timeDate = parseDateFromElement(timeEl);
    if (isNonEmpty(timeDate)) {
      return timeDate;
    }

    // Strategy 3: Element with date-related class within anchor
    const dateClassEl = targetAnchor.querySelector(
      '[class*="date"], [class*="Date"]'
    );
    const classDate = parseDateFromElement(dateClassEl);
    if (isNonEmpty(classDate)) {
      return classDate;
    }
  }

  // Fallback: Try document-level selectors
  if (isNonEmpty(selectors.dateSelector)) {
    const dateEl = doc.querySelector(selectors.dateSelector);
    const date = parseDateFromElement(dateEl);
    if (isNonEmpty(date)) {
      return date;
    }
  }

  const timeEl = doc.querySelector("time");
  const timeDate = parseDateFromElement(timeEl);
  if (isNonEmpty(timeDate)) {
    return timeDate;
  }

  const dateClassEl = doc.querySelector('[class*="date"], [class*="Date"]');
  const classDate = parseDateFromElement(dateClassEl);
  if (isNonEmpty(classDate)) {
    return classDate;
  }

  return undefined;
};

export {
  extractDate,
  extractTitle,
  findParentContainer,
  getStructureSignature,
  scoreStructureSignature,
};
