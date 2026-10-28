import { DECADES } from "../constants";
import type { DecadeGenderStats, TopName } from "../types/stats";
import type { NameDatabase } from "./database";

type StatsQueryOptions = {
  db: NameDatabase;
};

type TopNamesOptions = StatsQueryOptions & {
  limit: number;
};

/**
 * Calculates the share of births for the top N names.
 * @returns Share as a decimal (0-1)
 */
const getTopNShare = (
  db: NameDatabase,
  decade: string,
  gender: string,
  n: number,
  total: number
): number => {
  const row = db.queryOne<{ topSum: number }>(
    `SELECT SUM(count) as topSum FROM names WHERE decade = ? AND gender = ? AND rank <= ?`,
    [decade, gender, n]
  );
  return total > 0 ? (row?.topSum ?? 0) / total : 0;
};

/**
 * Calculates how many names are needed to reach a given percentage of births.
 * @param pct - Target percentage as decimal (e.g., 0.5 for 50%)
 * @returns Number of names needed to reach the percentage
 */
const getNamesToReachPct = (
  db: NameDatabase,
  decade: string,
  gender: string,
  pct: number,
  total: number
): number => {
  const target = total * pct;
  const rows = db.query<{ rank: number; count: number }>(
    `SELECT rank, count FROM names WHERE decade = ? AND gender = ? ORDER BY rank`,
    [decade, gender]
  );

  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.count;
    if (cumulative >= target) {
      return row.rank;
    }
  }
  return rows.length;
};

/**
 * Computes diversity indices for name distribution.
 * @returns Object containing HHI, effective names count, and Shannon entropy
 */
const computeDiversityIndices = (
  db: NameDatabase,
  decade: string,
  gender: string,
  total: number
): { hhi: number; effectiveNames: number; entropy: number } => {
  const rows = db.query<{ count: number }>(
    `SELECT count FROM names WHERE decade = ? AND gender = ?`,
    [decade, gender]
  );

  let hhi = 0;
  let entropy = 0;

  for (const row of rows) {
    const share = row.count / total;
    hhi += share * share;
    if (share > 0) {
      entropy -= share * Math.log(share);
    }
  }

  return {
    hhi,
    effectiveNames: hhi > 0 ? 1 / hhi : 0,
    entropy,
  };
};

/**
 * Computes comprehensive statistics for each decade and gender combination.
 * Includes birth totals, name counts, top-N concentration, diversity indices, and entropy.
 */
const computeDecadeStats = ({ db }: StatsQueryOptions): DecadeGenderStats[] => {
  const results: DecadeGenderStats[] = [];

  for (const decade of DECADES) {
    for (const gender of ["boy", "girl"] as const) {
      const totalRow = db.queryOne<{ total: number; cnt: number }>(
        `SELECT SUM(count) as total, COUNT(*) as cnt FROM names WHERE decade = ? AND gender = ?`,
        [decade, gender]
      );

      const total = totalRow?.total ?? 0;
      const nameCount = totalRow?.cnt ?? 0;

      if (total === 0) {
        continue;
      }

      // Top-N concentration
      const topConcentration = {
        top1: getTopNShare(db, decade, gender, 1, total),
        top5: getTopNShare(db, decade, gender, 5, total),
        top10: getTopNShare(db, decade, gender, 10, total),
      };

      // Names to reach percentages
      const namesToReach = {
        pct25: getNamesToReachPct(db, decade, gender, 0.25, total),
        pct50: getNamesToReachPct(db, decade, gender, 0.5, total),
      };

      // Diversity indices
      const diversity = computeDiversityIndices(db, decade, gender, total);

      results.push({
        decade,
        gender,
        totalBirths: total,
        nameCount,
        topNConcentration: topConcentration,
        namesToReach,
        hhi: diversity.hhi,
        effectiveNames: diversity.effectiveNames,
        entropy: diversity.entropy,
      });
    }
  }

  return results;
};

/**
 * Retrieves the top-ranked names for each decade and gender, at most `limit`
 * per decade/gender.
 */
const computeTopNames = ({ db, limit }: TopNamesOptions): TopName[] => {
  const results: TopName[] = [];

  for (const decade of DECADES) {
    for (const gender of ["boy", "girl"] as const) {
      const totalRow = db.queryOne<{ total: number }>(
        `SELECT SUM(count) as total FROM names WHERE decade = ? AND gender = ?`,
        [decade, gender]
      );
      const total = totalRow?.total ?? 1;

      const rows = db.query<{
        name: string;
        rank: number;
        count: number;
      }>(
        `SELECT name, rank, count FROM names WHERE decade = ? AND gender = ? ORDER BY rank LIMIT ?`,
        [decade, gender, limit]
      );

      for (const row of rows) {
        results.push({
          decade,
          gender,
          rank: row.rank,
          name: row.name,
          count: row.count,
          share: row.count / total,
        });
      }
    }
  }

  return results;
};

export type { StatsQueryOptions, TopNamesOptions };
export { computeDecadeStats, computeTopNames };
