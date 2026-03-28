import { LANGUAGE_KEYWORDS } from "../constants";

export type DetectedLanguage = "fi" | "sv" | "en" | "unknown";

/**
 * Detect the language of a company name based on keyword patterns.
 * Checks for Finnish keywords first, then Swedish, then English.
 */
export const detectLanguage = (name: string): DetectedLanguage => {
  const lower = name.toLowerCase();

  for (const [lang, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    for (const keyword of keywords) {
      const pattern = new RegExp(`\\b${keyword}\\b`, "i");
      if (pattern.test(lower)) {
        return lang as DetectedLanguage;
      }
    }
  }

  return "unknown";
};
