import { DECADES } from "../constants";
import type {
  ChurnMetrics,
  Comeback,
  NameDynamics,
  NewEntry,
  RankChange,
} from "../types/stats";
import type { StatsQueryOptions } from "./stats-distribution";

/**
 * Analyzes the lifecycle dynamics of each name across decades.
 * Computes peak decade, longevity, average rank, and rank stability.
 */
const computeNameDynamics = ({ db }: StatsQueryOptions): NameDynamics[] => {
  const rows = db.query<{
    name: string;
    gender: "boy" | "girl";
    peakDecade: string;
    peakRank: number;
    firstAppearance: string;
    lastAppearance: string;
    longevity: number;
    avgRank: number;
    sumRankSq: number;
  }>(`
      WITH name_stats AS (
        SELECT
          name,
          gender,
          MIN(decade) as firstAppearance,
          MAX(decade) as lastAppearance,
          COUNT(DISTINCT decade) as longevity,
          AVG(rank) as avgRank,
          AVG(rank * rank) as sumRankSq
        FROM names
        GROUP BY name, gender
      ),
      peak_info AS (
        SELECT
          name,
          gender,
          decade as peakDecade,
          rank as peakRank,
          ROW_NUMBER() OVER (PARTITION BY name, gender ORDER BY rank, decade DESC) as rn
        FROM names
      )
      SELECT
        ns.name,
        ns.gender,
        pi.peakDecade,
        pi.peakRank,
        ns.firstAppearance,
        ns.lastAppearance,
        ns.longevity,
        ns.avgRank,
        ns.sumRankSq
      FROM name_stats ns
      JOIN peak_info pi ON ns.name = pi.name AND ns.gender = pi.gender AND pi.rn = 1
      ORDER BY ns.longevity DESC, ns.avgRank ASC
    `);

  return rows.map((row) => {
    const variance = row.sumRankSq - row.avgRank * row.avgRank;
    const stddev = variance > 0 ? Math.sqrt(variance) : 0;

    // Calculate time to peak (in decades)
    const firstIdx = DECADES.indexOf(row.firstAppearance);
    const peakIdx = DECADES.indexOf(row.peakDecade);
    const timeToPeak = peakIdx >= firstIdx ? peakIdx - firstIdx : 0;

    return {
      name: row.name,
      gender: row.gender,
      peakDecade: row.peakDecade,
      peakRank: row.peakRank,
      firstAppearance: row.firstAppearance,
      lastAppearance: row.lastAppearance,
      timeToPeak,
      longevity: row.longevity,
      avgRank: row.avgRank,
      rankStddev: stddev,
    };
  });
};

/**
 * Identifies names with the largest rank changes between consecutive decades.
 * @returns Object containing top 20 climbers and top 20 fallers
 */
const computeRankChanges = ({
  db,
}: StatsQueryOptions): { climbers: RankChange[]; fallers: RankChange[] } => {
  const changes: RankChange[] = [];

  for (let i = 1; i < DECADES.length; i++) {
    const fromDecade = DECADES[i - 1];
    const toDecade = DECADES[i];
    if (
      fromDecade === undefined ||
      fromDecade === "" ||
      toDecade === undefined ||
      toDecade === ""
    ) {
      continue;
    }

    const rows = db.query<{
      name: string;
      gender: "boy" | "girl";
      fromRank: number;
      toRank: number;
    }>(
      `
        SELECT
          curr.name,
          curr.gender,
          prev.rank as fromRank,
          curr.rank as toRank
        FROM names curr
        JOIN names prev ON curr.name = prev.name AND curr.gender = prev.gender
        WHERE curr.decade = ? AND prev.decade = ?
      `,
      [toDecade, fromDecade]
    );

    for (const row of rows) {
      changes.push({
        name: row.name,
        gender: row.gender,
        fromDecade,
        toDecade,
        fromRank: row.fromRank,
        toRank: row.toRank,
        change: row.fromRank - row.toRank, // positive = climbed
      });
    }
  }

  const sorted = [...changes].sort((a, b) => b.change - a.change);
  const climbers = sorted.slice(0, 20);
  const fallers = sorted.slice(-20).reverse();

  return { climbers, fallers };
};

/**
 * Finds names that newly appeared in each decade (not present in the previous decade).
 * @returns Array of new entries with their debut decade and initial rank
 */
const computeNewEntries = ({ db }: StatsQueryOptions): NewEntry[] => {
  const results: NewEntry[] = [];

  for (let i = 1; i < DECADES.length; i++) {
    const prevDecade = DECADES[i - 1];
    const currDecade = DECADES[i];
    if (
      prevDecade === undefined ||
      prevDecade === "" ||
      currDecade === undefined ||
      currDecade === ""
    ) {
      continue;
    }

    const rows = db.query<{
      name: string;
      gender: "boy" | "girl";
      rank: number;
      count: number;
    }>(
      `
        SELECT curr.name, curr.gender, curr.rank, curr.count
        FROM names curr
        LEFT JOIN names prev ON curr.name = prev.name AND curr.gender = prev.gender AND prev.decade = ?
        WHERE curr.decade = ? AND prev.id IS NULL
        ORDER BY curr.rank
      `,
      [prevDecade, currDecade]
    );

    for (const row of rows) {
      results.push({
        name: row.name,
        gender: row.gender,
        decade: currDecade,
        rank: row.rank,
        count: row.count,
      });
    }
  }

  return results;
};

/**
 * Identifies names that returned to the rankings after one or more decades of absence.
 * @returns Array of comebacks sorted by gap length (longest gaps first)
 */
const computeComebacks = ({ db }: StatsQueryOptions): Comeback[] => {
  const results: Comeback[] = [];

  // Get all appearances per name/gender
  const appearances = db.query<{
    name: string;
    gender: "boy" | "girl";
    decade: string;
    rank: number;
  }>(`
      SELECT name, gender, decade, rank
      FROM names
      ORDER BY name, gender, decade
    `);

  // Group by name/gender
  const grouped = new Map<string, { decade: string; rank: number }[]>();
  for (const row of appearances) {
    const key = `${row.name}|${row.gender}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.push({ decade: row.decade, rank: row.rank });
    } else {
      grouped.set(key, [{ decade: row.decade, rank: row.rank }]);
    }
  }

  // Find gaps
  for (const [key, decadeList] of grouped) {
    const parts = key.split("|");
    const name = parts[0];
    const gender = parts[1];
    if (
      name === undefined ||
      name === "" ||
      gender === undefined ||
      gender === ""
    ) {
      continue;
    }

    for (let i = 1; i < decadeList.length; i++) {
      const prevEntry = decadeList[i - 1];
      const currEntry = decadeList[i];
      if (!prevEntry || !currEntry) {
        continue;
      }

      const prevIdx = DECADES.indexOf(prevEntry.decade);
      const currIdx = DECADES.indexOf(currEntry.decade);
      const gap = currIdx - prevIdx;

      if (gap > 1) {
        results.push({
          name,
          gender: gender as "boy" | "girl",
          comebackDecade: currEntry.decade,
          previousDecade: prevEntry.decade,
          gapDecades: gap - 1,
          comebackRank: currEntry.rank,
        });
      }
    }
  }

  return results.sort((a, b) => b.gapDecades - a.gapDecades);
};

/**
 * Computes name churn metrics between consecutive decades.
 * Measures how much the name pool changes over time.
 * @returns Array of churn metrics including new/exited names and Jaccard similarity
 */
const computeChurnMetrics = ({ db }: StatsQueryOptions): ChurnMetrics[] => {
  const results: ChurnMetrics[] = [];

  for (let i = 1; i < DECADES.length; i++) {
    const fromDecade = DECADES[i - 1];
    const toDecade = DECADES[i];
    if (
      fromDecade === undefined ||
      fromDecade === "" ||
      toDecade === undefined ||
      toDecade === ""
    ) {
      continue;
    }

    for (const gender of ["boy", "girl"] as const) {
      // Get name sets
      const fromNames = new Set(
        db
          .query<{
            name: string;
          }>(`SELECT name FROM names WHERE decade = ? AND gender = ?`, [
            fromDecade,
            gender,
          ])
          .map((r) => r.name)
      );

      const toNames = new Set(
        db
          .query<{
            name: string;
          }>(`SELECT name FROM names WHERE decade = ? AND gender = ?`, [
            toDecade,
            gender,
          ])
          .map((r) => r.name)
      );

      const intersection = new Set(
        [...fromNames].filter((n) => toNames.has(n))
      );
      const union = new Set([...fromNames, ...toNames]);

      const newNames = [...toNames].filter((n) => !fromNames.has(n)).length;
      const exitedNames = [...fromNames].filter((n) => !toNames.has(n)).length;

      results.push({
        fromDecade,
        toDecade,
        gender,
        churnRate: toNames.size > 0 ? newNames / toNames.size : 0,
        newNames,
        exitedNames,
        jaccardSimilarity: union.size > 0 ? intersection.size / union.size : 0,
      });
    }
  }

  return results;
};

export {
  computeNameDynamics,
  computeRankChanges,
  computeNewEntries,
  computeComebacks,
  computeChurnMetrics,
};
