import { FIRST_DECADE, LAST_DECADE, DECADES } from "../constants";
import type {
  AllStats,
  ChurnMetrics,
  Comeback,
  DecadeGenderStats,
  EvergreenName,
  LetterStats,
  NameDynamics,
  NameLengthStats,
  NewEntry,
  RankChange,
  SpecialCharStats,
  SuffixStats,
  TopName,
  UnisexName,
} from "../types/stats";
import type { NameDatabase } from "./database";
import { computeDecadeStats, computeTopNames } from "./stats-distribution";
import {
  computeChurnMetrics,
  computeComebacks,
  computeNameDynamics,
  computeNewEntries,
  computeRankChanges,
} from "./stats-trends";

/**
 * Generates statistical analysis from Finnish names data stored in a NameDatabase.
 * Computes various metrics including decade stats, top names, name dynamics,
 * rank changes, churn metrics, and phonetic analysis.
 */
class StatsGenerator {
  /**
   * Creates a new StatsGenerator instance.
   * @param db - The NameDatabase instance to query for statistics
   */
  constructor(private readonly db: NameDatabase) {}

  /**
   * Computes comprehensive statistics for each decade and gender combination.
   * Includes birth totals, name counts, top-N concentration, diversity indices, and entropy.
   * @returns Array of decade/gender statistics
   */
  computeDecadeStats(): DecadeGenderStats[] {
    return computeDecadeStats({ db: this.db });
  }

  /**
   * Retrieves the top-ranked names for each decade and gender.
   * @param limit - Maximum number of names per decade/gender (default: 10)
   * @returns Array of top names with rank, count, and share
   */
  computeTopNames(limit = 10): TopName[] {
    return computeTopNames({ db: this.db, limit });
  }

  /**
   * Analyzes the lifecycle dynamics of each name across decades.
   * Computes peak decade, longevity, average rank, and rank stability.
   * @returns Array of name dynamics with timing and consistency metrics
   */
  computeNameDynamics(): NameDynamics[] {
    return computeNameDynamics({ db: this.db });
  }

  /**
   * Identifies names with the largest rank changes between consecutive decades.
   * @returns Object containing top 20 climbers and top 20 fallers
   */
  computeRankChanges(): { climbers: RankChange[]; fallers: RankChange[] } {
    return computeRankChanges({ db: this.db });
  }

  /**
   * Finds names that newly appeared in each decade (not present in the previous decade).
   * @returns Array of new entries with their debut decade and initial rank
   */
  computeNewEntries(): NewEntry[] {
    return computeNewEntries({ db: this.db });
  }

  /**
   * Identifies names that returned to the rankings after one or more decades of absence.
   * @returns Array of comebacks sorted by gap length (longest gaps first)
   */
  computeComebacks(): Comeback[] {
    return computeComebacks({ db: this.db });
  }

  /**
   * Computes name churn metrics between consecutive decades.
   * Measures how much the name pool changes over time.
   * @returns Array of churn metrics including new/exited names and Jaccard similarity
   */
  computeChurnMetrics(): ChurnMetrics[] {
    return computeChurnMetrics({ db: this.db });
  }

  /**
   * Finds names used for both boys and girls in the same decade.
   * @returns Array of unisex names with rankings and counts for each gender
   */
  computeUnisexNames(): UnisexName[] {
    return this.db.query<UnisexName>(`
      SELECT
        b.name,
        b.decade,
        b.rank as boyRank,
        g.rank as girlRank,
        b.count as boyCount,
        g.count as girlCount
      FROM names b
      JOIN names g ON b.name = g.name AND b.decade = g.decade
      WHERE b.gender = 'boy' AND g.gender = 'girl'
      ORDER BY b.decade, b.name
    `);
  }

  /**
   * Identifies names that have remained popular across 10 or more decades.
   * @returns Array of evergreen names sorted by longevity and average rank
   */
  computeEvergreenNames(): EvergreenName[] {
    return this.db.query<EvergreenName>(`
      SELECT
        name,
        gender,
        COUNT(DISTINCT decade) as decadesPresent,
        AVG(rank) as avgRank,
        SUM(count) as totalCount
      FROM names
      GROUP BY name, gender
      HAVING COUNT(DISTINCT decade) >= 10
      ORDER BY decadesPresent DESC, avgRank ASC
    `);
  }

  /**
   * Analyzes the distribution of first letters across names.
   * @returns Array of letter statistics with counts and shares per decade/gender
   */
  computeLetterStats(): LetterStats[] {
    const results: LetterStats[] = [];

    for (const decade of DECADES) {
      for (const gender of ["boy", "girl"] as const) {
        const totalRow = this.db.queryOne<{ total: number }>(
          `SELECT SUM(count) as total FROM names WHERE decade = ? AND gender = ?`,
          [decade, gender]
        );
        const total = totalRow?.total ?? 1;

        const rows = this.db.query<{
          letter: string;
          nameCount: number;
          totalBirths: number;
        }>(
          `
          SELECT
            UPPER(SUBSTR(name, 1, 1)) as letter,
            COUNT(*) as nameCount,
            SUM(count) as totalBirths
          FROM names
          WHERE decade = ? AND gender = ?
          GROUP BY UPPER(SUBSTR(name, 1, 1))
          ORDER BY totalBirths DESC
        `,
          [decade, gender]
        );

        for (const row of rows) {
          results.push({
            decade,
            gender,
            letter: row.letter,
            nameCount: row.nameCount,
            totalBirths: row.totalBirths,
            share: row.totalBirths / total,
          });
        }
      }
    }

    return results;
  }

  /**
   * Analyzes the distribution of name endings (suffixes like -nen, -us, -ja).
   * @returns Array of suffix statistics with counts and shares per decade/gender
   */
  computeSuffixStats(): SuffixStats[] {
    const results: SuffixStats[] = [];

    for (const decade of DECADES) {
      for (const gender of ["boy", "girl"] as const) {
        const totalRow = this.db.queryOne<{ total: number }>(
          `SELECT SUM(count) as total FROM names WHERE decade = ? AND gender = ?`,
          [decade, gender]
        );
        const total = totalRow?.total ?? 1;

        const rows = this.db.query<{
          suffix: string;
          nameCount: number;
          totalBirths: number;
        }>(
          `
          SELECT
            CASE
              WHEN name LIKE '%nen' THEN '-nen'
              WHEN name LIKE '%us' THEN '-us'
              WHEN name LIKE '%ja' THEN '-ja'
              WHEN name LIKE '%ri' THEN '-ri'
              WHEN name LIKE '%a' THEN '-a'
              WHEN name LIKE '%i' THEN '-i'
              WHEN name LIKE '%o' THEN '-o'
              WHEN name LIKE '%e' THEN '-e'
              ELSE '-other'
            END as suffix,
            COUNT(*) as nameCount,
            SUM(count) as totalBirths
          FROM names
          WHERE decade = ? AND gender = ?
          GROUP BY suffix
          ORDER BY totalBirths DESC
        `,
          [decade, gender]
        );

        for (const row of rows) {
          results.push({
            decade,
            gender,
            suffix: row.suffix,
            nameCount: row.nameCount,
            totalBirths: row.totalBirths,
            share: row.totalBirths / total,
          });
        }
      }
    }

    return results;
  }

  /**
   * Computes name length statistics (average, min, max) per decade and gender.
   * @returns Array of name length statistics
   */
  computeNameLengthStats(): NameLengthStats[] {
    return this.db.query<NameLengthStats>(`
      SELECT
        decade,
        gender,
        AVG(LENGTH(name)) as avgLength,
        MIN(LENGTH(name)) as minLength,
        MAX(LENGTH(name)) as maxLength
      FROM names
      GROUP BY decade, gender
      ORDER BY decade, gender
    `);
  }

  /**
   * Analyzes the usage of Finnish special characters (ä, ö) in names.
   * @returns Array of special character statistics with shares per decade/gender
   */
  computeSpecialCharStats(): SpecialCharStats[] {
    const rows = this.db.query<{
      decade: string;
      gender: "boy" | "girl";
      namesWithUmlautA: number;
      namesWithUmlautO: number;
      totalNames: number;
    }>(`
      SELECT
        decade,
        gender,
        SUM(CASE WHEN name LIKE '%ä%' OR name LIKE '%Ä%' THEN 1 ELSE 0 END) as namesWithUmlautA,
        SUM(CASE WHEN name LIKE '%ö%' OR name LIKE '%Ö%' THEN 1 ELSE 0 END) as namesWithUmlautO,
        COUNT(*) as totalNames
      FROM names
      GROUP BY decade, gender
      ORDER BY decade, gender
    `);

    return rows.map((row) => ({
      ...row,
      umlautAShare: row.namesWithUmlautA / row.totalNames,
      umlautOShare: row.namesWithUmlautO / row.totalNames,
    }));
  }

  /**
   * Computes all available statistics in a single call.
   * @returns Comprehensive statistics object containing all metrics
   */
  computeAll(): AllStats {
    const decadeStats = this.computeDecadeStats();
    const topNames = this.computeTopNames(10);
    const nameDynamics = this.computeNameDynamics();
    const { climbers, fallers } = this.computeRankChanges();
    const newEntries = this.computeNewEntries();
    const comebacks = this.computeComebacks();
    const churnMetrics = this.computeChurnMetrics();
    const unisexNames = this.computeUnisexNames();
    const evergreenNames = this.computeEvergreenNames();
    const letterStats = this.computeLetterStats();
    const suffixStats = this.computeSuffixStats();
    const nameLengthStats = this.computeNameLengthStats();
    const specialCharStats = this.computeSpecialCharStats();

    // Count unique names
    const uniqueNamesRow = this.db.queryOne<{ cnt: number }>(
      `SELECT COUNT(DISTINCT name || '|' || gender) as cnt FROM names`
    );

    return {
      generatedAt: new Date().toISOString(),
      dataSource: "DVV (Digi- ja väestötietovirasto)",
      decadeRange: { first: FIRST_DECADE, last: LAST_DECADE },
      totalUniqueNames: uniqueNamesRow?.cnt ?? 0,
      totalRecords: this.db.getTotalCount(),

      decadeStats,
      topNames,
      nameDynamics,
      biggestClimbers: climbers,
      biggestFallers: fallers,
      newEntries,
      comebacks,
      churnMetrics,
      unisexNames,
      evergreenNames,
      letterStats,
      suffixStats,
      nameLengthStats,
      specialCharStats,
    };
  }
}

export { StatsGenerator };
