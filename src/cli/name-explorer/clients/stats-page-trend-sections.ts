import type { AllStats } from "../types/stats";
import {
  escapeHtml,
  formatDecimal,
  formatNumber,
  formatPercent,
} from "./stats-page-format";

const generateDiversitySection = (stats: AllStats): string => {
  const boyDiversity = stats.decadeStats
    .filter((s) => s.gender === "boy")
    .sort((a, b) => a.decade.localeCompare(b.decade));
  const girlDiversity = stats.decadeStats
    .filter((s) => s.gender === "girl")
    .sort((a, b) => a.decade.localeCompare(b.decade));

  return `
      <div class="section-header">
        <h2>Diversity Indices Over Time</h2>
        <p>Measuring how concentrated vs. spread out naming choices are</p>
      </div>

      <details open>
        <summary>About Diversity Metrics</summary>
        <div>
          <p><strong>HHI (Herfindahl-Hirschman Index):</strong> Sum of squared shares. Lower = more diverse. Range: 0.01 (very diverse) to 1 (one name dominates).</p>
          <p><strong>Effective Names:</strong> 1/HHI. "It's like having N equally popular names." Higher = more diversity.</p>
          <p><strong>Entropy:</strong> -Sum(share * ln(share)). Higher = more diversity. Max value = ln(100) ≈ 4.6 for 100 equally popular names.</p>
        </div>
      </details>

      <div class="section-header">
        <h2>Boys: Diversity Metrics by Decade</h2>
      </div>
      <table>
        <thead>
          <tr><th>Decade</th><th>HHI</th><th>Effective Names</th><th>Entropy</th><th>Names to 50%</th></tr>
        </thead>
        <tbody>
          ${boyDiversity
            .map(
              (s) => `
            <tr>
              <td>${s.decade}</td>
              <td class="number">${formatDecimal(s.hhi, 4)}</td>
              <td class="number">${formatDecimal(s.effectiveNames, 1)}</td>
              <td class="number">${formatDecimal(s.entropy, 3)}</td>
              <td class="number">${s.namesToReach.pct50}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <div class="section-header">
        <h2>Girls: Diversity Metrics by Decade</h2>
      </div>
      <table>
        <thead>
          <tr><th>Decade</th><th>HHI</th><th>Effective Names</th><th>Entropy</th><th>Names to 50%</th></tr>
        </thead>
        <tbody>
          ${girlDiversity
            .map(
              (s) => `
            <tr>
              <td>${s.decade}</td>
              <td class="number">${formatDecimal(s.hhi, 4)}</td>
              <td class="number">${formatDecimal(s.effectiveNames, 1)}</td>
              <td class="number">${formatDecimal(s.entropy, 3)}</td>
              <td class="number">${s.namesToReach.pct50}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
};

const generateChurnSection = (stats: AllStats): string => {
  const boyChurn = stats.churnMetrics.filter((c) => c.gender === "boy");
  const girlChurn = stats.churnMetrics.filter((c) => c.gender === "girl");

  return `
      <div class="section-header">
        <h2>Churn Analysis</h2>
        <p>How much the Top 100 names change between decades</p>
      </div>

      <details open>
        <summary>About Churn Metrics</summary>
        <div>
          <p><strong>Churn Rate:</strong> Percentage of names in the new decade that weren't in the previous decade's Top 100.</p>
          <p><strong>Jaccard Similarity:</strong> Intersection / Union of the two name sets. Higher = more similar. Range: 0 (no overlap) to 1 (identical).</p>
        </div>
      </details>

      <div class="section-header">
        <h2>Boys: Decade-to-Decade Churn</h2>
      </div>
      <table>
        <thead>
          <tr><th>Transition</th><th>New Names</th><th>Exited</th><th>Churn Rate</th><th>Jaccard</th></tr>
        </thead>
        <tbody>
          ${boyChurn
            .map(
              (c) => `
            <tr>
              <td>${c.fromDecade} → ${c.toDecade}</td>
              <td class="number">${c.newNames}</td>
              <td class="number">${c.exitedNames}</td>
              <td class="number">${formatPercent(c.churnRate)}</td>
              <td class="number">${formatDecimal(c.jaccardSimilarity, 3)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <div class="section-header">
        <h2>Girls: Decade-to-Decade Churn</h2>
      </div>
      <table>
        <thead>
          <tr><th>Transition</th><th>New Names</th><th>Exited</th><th>Churn Rate</th><th>Jaccard</th></tr>
        </thead>
        <tbody>
          ${girlChurn
            .map(
              (c) => `
            <tr>
              <td>${c.fromDecade} → ${c.toDecade}</td>
              <td class="number">${c.newNames}</td>
              <td class="number">${c.exitedNames}</td>
              <td class="number">${formatPercent(c.churnRate)}</td>
              <td class="number">${formatDecimal(c.jaccardSimilarity, 3)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <div class="section-header">
        <h2>Evergreen Names</h2>
        <p>Names that have remained in Top 100 for 10+ decades</p>
      </div>
      <table>
        <thead>
          <tr><th>Name</th><th>Gender</th><th>Decades</th><th>Avg Rank</th><th>Total Count</th></tr>
        </thead>
        <tbody>
          ${stats.evergreenNames
            .slice(0, 20)
            .map(
              (n) => `
            <tr>
              <td>${escapeHtml(n.name)}</td>
              <td class="gender-${n.gender}">${n.gender === "boy" ? "Boy" : "Girl"}</td>
              <td class="number">${n.decadesPresent}</td>
              <td class="number">${formatDecimal(n.avgRank, 1)}</td>
              <td class="number">${formatNumber(n.totalCount)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
};

export { generateDiversitySection, generateChurnSection };
