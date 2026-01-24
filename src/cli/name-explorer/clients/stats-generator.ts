import { DECADES, FIRST_DECADE, LAST_DECADE } from "../constants";
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
} from "../types";
import type { NameDatabase } from "./database";

/**
 * Generates statistical analysis from Finnish names data stored in a NameDatabase.
 * Computes various metrics including decade stats, top names, name dynamics,
 * rank changes, churn metrics, and phonetic analysis.
 */
export class StatsGenerator {
  /**
   * Creates a new StatsGenerator instance.
   * @param db - The NameDatabase instance to query for statistics
   */
  constructor(private db: NameDatabase) {}

  /**
   * Computes comprehensive statistics for each decade and gender combination.
   * Includes birth totals, name counts, top-N concentration, diversity indices, and entropy.
   * @returns Array of decade/gender statistics
   */
  computeDecadeStats(): DecadeGenderStats[] {
    const results: DecadeGenderStats[] = [];

    for (const decade of DECADES) {
      for (const gender of ["boy", "girl"] as const) {
        const totalRow = this.db.queryOne<{ total: number; cnt: number }>(
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
          top1: this.getTopNShare(decade, gender, 1, total),
          top5: this.getTopNShare(decade, gender, 5, total),
          top10: this.getTopNShare(decade, gender, 10, total),
        };

        // Names to reach percentages
        const namesToReach = {
          pct25: this.getNamesToReachPct(decade, gender, 0.25, total),
          pct50: this.getNamesToReachPct(decade, gender, 0.5, total),
        };

        // Diversity indices
        const diversity = this.computeDiversityIndices(decade, gender, total);

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
  }

  /**
   * Calculates the share of births for the top N names.
   * @param decade - The decade to query
   * @param gender - The gender category
   * @param n - Number of top names to include
   * @param total - Total births for normalization
   * @returns Share as a decimal (0-1)
   */
  private getTopNShare(
    decade: string,
    gender: string,
    n: number,
    total: number
  ): number {
    const row = this.db.queryOne<{ topSum: number }>(
      `SELECT SUM(count) as topSum FROM names WHERE decade = ? AND gender = ? AND rank <= ?`,
      [decade, gender, n]
    );
    return total > 0 ? (row?.topSum ?? 0) / total : 0;
  }

  /**
   * Calculates how many names are needed to reach a given percentage of births.
   * @param decade - The decade to query
   * @param gender - The gender category
   * @param pct - Target percentage as decimal (e.g., 0.5 for 50%)
   * @param total - Total births for the decade/gender
   * @returns Number of names needed to reach the percentage
   */
  private getNamesToReachPct(
    decade: string,
    gender: string,
    pct: number,
    total: number
  ): number {
    const target = total * pct;
    const rows = this.db.query<{ rank: number; count: number }>(
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
  }

  /**
   * Computes diversity indices for name distribution.
   * @param decade - The decade to query
   * @param gender - The gender category
   * @param total - Total births for normalization
   * @returns Object containing HHI, effective names count, and Shannon entropy
   */
  private computeDiversityIndices(
    decade: string,
    gender: string,
    total: number
  ): { hhi: number; effectiveNames: number; entropy: number } {
    const rows = this.db.query<{ count: number }>(
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
  }

  /**
   * Retrieves the top-ranked names for each decade and gender.
   * @param limit - Maximum number of names per decade/gender (default: 10)
   * @returns Array of top names with rank, count, and share
   */
  computeTopNames(limit = 10): TopName[] {
    const results: TopName[] = [];

    for (const decade of DECADES) {
      for (const gender of ["boy", "girl"] as const) {
        const totalRow = this.db.queryOne<{ total: number }>(
          `SELECT SUM(count) as total FROM names WHERE decade = ? AND gender = ?`,
          [decade, gender]
        );
        const total = totalRow?.total ?? 1;

        const rows = this.db.query<{
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
  }

  /**
   * Analyzes the lifecycle dynamics of each name across decades.
   * Computes peak decade, longevity, average rank, and rank stability.
   * @returns Array of name dynamics with timing and consistency metrics
   */
  computeNameDynamics(): NameDynamics[] {
    const rows = this.db.query<{
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
  }

  /**
   * Identifies names with the largest rank changes between consecutive decades.
   * @returns Object containing top 20 climbers and top 20 fallers
   */
  computeRankChanges(): { climbers: RankChange[]; fallers: RankChange[] } {
    const changes: RankChange[] = [];

    for (let i = 1; i < DECADES.length; i++) {
      const fromDecade = DECADES[i - 1];
      const toDecade = DECADES[i];
      if (!fromDecade || !toDecade) {
        continue;
      }

      const rows = this.db.query<{
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
  }

  /**
   * Finds names that newly appeared in each decade (not present in the previous decade).
   * @returns Array of new entries with their debut decade and initial rank
   */
  computeNewEntries(): NewEntry[] {
    const results: NewEntry[] = [];

    for (let i = 1; i < DECADES.length; i++) {
      const prevDecade = DECADES[i - 1];
      const currDecade = DECADES[i];
      if (!prevDecade || !currDecade) {
        continue;
      }

      const rows = this.db.query<{
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
  }

  /**
   * Identifies names that returned to the rankings after one or more decades of absence.
   * @returns Array of comebacks sorted by gap length (longest gaps first)
   */
  computeComebacks(): Comeback[] {
    const results: Comeback[] = [];

    // Get all appearances per name/gender
    const appearances = this.db.query<{
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
      if (!name || !gender) {
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
  }

  /**
   * Computes name churn metrics between consecutive decades.
   * Measures how much the name pool changes over time.
   * @returns Array of churn metrics including new/exited names and Jaccard similarity
   */
  computeChurnMetrics(): ChurnMetrics[] {
    const results: ChurnMetrics[] = [];

    for (let i = 1; i < DECADES.length; i++) {
      const fromDecade = DECADES[i - 1];
      const toDecade = DECADES[i];
      if (!fromDecade || !toDecade) {
        continue;
      }

      for (const gender of ["boy", "girl"] as const) {
        // Get name sets
        const fromNames = new Set(
          this.db
            .query<{
              name: string;
            }>(`SELECT name FROM names WHERE decade = ? AND gender = ?`, [
              fromDecade,
              gender,
            ])
            .map((r) => r.name)
        );

        const toNames = new Set(
          this.db
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
        const exitedNames = [...fromNames].filter(
          (n) => !toNames.has(n)
        ).length;

        results.push({
          fromDecade,
          toDecade,
          gender,
          churnRate: toNames.size > 0 ? newNames / toNames.size : 0,
          newNames,
          exitedNames,
          jaccardSimilarity:
            union.size > 0 ? intersection.size / union.size : 0,
        });
      }
    }

    return results;
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
