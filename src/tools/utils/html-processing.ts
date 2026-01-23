import sanitize from "sanitize-html";
import { JSDOM } from "jsdom";
import { NodeHtmlMarkdown } from "node-html-markdown";

/**
 * Result of processing HTML content
 */
export type ProcessedContent = {
  title: string | null;
  markdown: string;
  text: string;
};

/**
 * Elements to remove (navigation, ads, etc.)
 */
const REMOVE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[role='complementary']",
  "[role='search']",
  ".nav",
  ".navbar",
  ".navigation",
  ".menu",
  ".header",
  ".site-header",
  ".page-header",
  ".footer",
  ".site-footer",
  ".page-footer",
  ".sidebar",
  ".side-bar",
  ".widget",
  ".ads",
  ".ad",
  ".advertisement",
  ".advert",
  ".social",
  ".share",
  ".sharing",
  ".comments",
  ".comment-section",
  ".related",
  ".recommended",
  "#nav",
  "#navigation",
  "#menu",
  "#header",
  "#site-header",
  "#footer",
  "#site-footer",
  "#sidebar",
  "#side-bar",
  "#comments",
  // Cookie banners and popups
  ".cookie",
  ".cookie-banner",
  ".cookie-consent",
  "#cookie",
  "#cookie-banner",
  ".popup",
  ".modal",
];

/**
 * Priority order for main content detection
 */
const MAIN_CONTENT_SELECTORS = [
  "main",
  "article",
  "[role='main']",
  "#content",
  "#main-content",
  "#main",
  ".content",
  ".main-content",
  ".post-content",
  ".article-content",
  ".entry-content",
  ".page-content",
];

/**
 * sanitize-html configuration for strict sanitization
 */
const SANITIZE_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    // Headings
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    // Text structure
    "p",
    "div",
    "span",
    "br",
    "hr",
    // Lists
    "ul",
    "ol",
    "li",
    // Formatting
    "b",
    "i",
    "strong",
    "em",
    "u",
    "s",
    "strike",
    "del",
    "ins",
    "sub",
    "sup",
    "small",
    "mark",
    // Links and media
    "a",
    "img",
    // Code
    "pre",
    "code",
    "kbd",
    "samp",
    "var",
    // Tables
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    // Quotes
    "blockquote",
    "q",
    "cite",
    // Definition lists
    "dl",
    "dt",
    "dd",
    // Misc
    "figure",
    "figcaption",
    "details",
    "summary",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    // No global attributes - this removes all event handlers
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"], // No data: URIs for images
    a: ["http", "https", "mailto"],
  },
  disallowedTagsMode: "discard",
};

/**
 * HTML-to-Markdown converter instance
 */
const markdownConverter = new NodeHtmlMarkdown({
  maxConsecutiveNewlines: 2,
  bulletMarker: "-",
  codeBlockStyle: "fenced",
});

/**
 * Sanitize HTML content by removing dangerous elements and attributes.
 * Uses sanitize-html to strip scripts, iframes, event handlers, etc.
 */
export const sanitizeHtml = (html: string): string =>
  sanitize(html, SANITIZE_OPTIONS);

/**
 * Extract the main content from HTML, removing navigation, ads, etc.
 * Falls back to body content if no main content area is found.
 */
export const extractMainContent = (html: string): string => {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Remove non-content elements
  for (const selector of REMOVE_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  }

  // Try to find main content area
  for (const selector of MAIN_CONTENT_SELECTORS) {
    const mainContent = document.querySelector(selector);
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- textContent is non-null on Element
    if (mainContent && mainContent.textContent.trim()) {
      return mainContent.innerHTML;
    }
  }

  // Fall back to body
  return document.body.innerHTML;
};

/**
 * Convert sanitized HTML to Markdown
 */
export const convertToMarkdown = (html: string): string =>
  markdownConverter.translate(html);

/**
 * Convert Markdown/HTML to plain text by stripping formatting
 */
export const convertToPlainText = (markdown: string): string =>
  markdown
    // Remove markdown images ![alt](url) -> alt (must come before links)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Remove headings markers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, "")
    // Clean up extra whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Extract the page title from HTML
 */
export const extractTitle = (html: string): string | null => {
  const dom = new JSDOM(html);
  const titleElement = dom.window.document.querySelector("title");
  if (!titleElement) {
    return null;
  }
  const titleText = titleElement.textContent.trim();
  return titleText === "" ? null : titleText;
};

/**
 * Process HTML content through the full pipeline:
 * 1. Extract title
 * 2. Extract main content
 * 3. Sanitize
 * 4. Convert to Markdown
 * 5. Generate plain text
 */
export const processHtmlContent = (html: string): ProcessedContent => {
  // Extract title before any modifications
  const title = extractTitle(html);

  // Extract main content (removes nav, footer, etc.)
  const mainContent = extractMainContent(html);

  // Sanitize the main content
  const sanitized = sanitizeHtml(mainContent);

  // Convert to Markdown
  const markdown = convertToMarkdown(sanitized);

  // Generate plain text
  const text = convertToPlainText(markdown);

  return {
    title,
    markdown,
    text,
  };
};
