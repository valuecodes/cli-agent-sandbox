import type { PrhCompany, PrhName } from "../types/schemas";

export type MatchResult = {
  company: PrhCompany;
  matchedName: PrhName;
  confidence: "exact" | "high" | "low";
};

const normalize = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

/** Jaccard similarity on word tokens */
const tokenSimilarity = (a: string, b: string): number => {
  const tokensA = new Set(normalize(a).split(" "));
  const tokensB = new Set(normalize(b).split(" "));
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      intersection++;
    }
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
};

const TOKEN_SIMILARITY_THRESHOLD = 0.5;

/**
 * Find the best matching company from PRH results.
 * Only considers active names (no endDate).
 */
export const findBestMatch = ({
  query,
  companies,
}: {
  query: string;
  companies: PrhCompany[];
}): MatchResult | null => {
  const normalizedQuery = normalize(query);

  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  for (const company of companies) {
    const activeNames = company.names.filter((n) => !n.endDate);

    for (const nameEntry of activeNames) {
      const normalizedName = normalize(nameEntry.name);

      // Exact match
      if (normalizedName === normalizedQuery) {
        return { company, matchedName: nameEntry, confidence: "exact" };
      }

      // Contains match (one contains the other)
      if (
        normalizedName.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedName)
      ) {
        const score = 0.9;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { company, matchedName: nameEntry, confidence: "high" };
        }
        continue;
      }

      // Token overlap
      const score = tokenSimilarity(normalizedQuery, normalizedName);
      if (score > TOKEN_SIMILARITY_THRESHOLD && score > bestScore) {
        bestScore = score;
        bestMatch = {
          company,
          matchedName: nameEntry,
          confidence: score > 0.7 ? "high" : "low",
        };
      }
    }
  }

  return bestMatch;
};
