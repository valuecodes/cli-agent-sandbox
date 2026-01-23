import type { Logger } from "../../clients/logger";
import type { AllStats, LetterStats, TopName, UnisexName } from "./stats-types";

export interface StatsPageGeneratorConfig {
  logger: Logger;
}

export class StatsPageGenerator {
  private logger: Logger;

  constructor(config: StatsPageGeneratorConfig) {
    this.logger = config.logger;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private formatNumber(n: number): string {
    return n.toLocaleString("fi-FI");
  }

  private formatPercent(n: number, decimals = 1): string {
    return (n * 100).toFixed(decimals) + "%";
  }

  private formatDecimal(n: number, decimals = 2): string {
    return n.toFixed(decimals);
  }

  generate(stats: AllStats): string {
    this.logger.info("Generating statistics HTML page");

    const css = this.generateCSS();
    const overview = this.generateOverviewSection(stats);
    const leaderboards = this.generateLeaderboardsSection(stats);
    const dynamics = this.generateDynamicsSection(stats);
    const diversity = this.generateDiversitySection(stats);
    const churn = this.generateChurnSection(stats);
    const gender = this.generateGenderSection(stats);
    const linguistics = this.generateLinguisticsSection(stats);

    return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finnish Name Statistics (${stats.decadeRange.first}-${stats.decadeRange.last})</title>
  <style>${css}</style>
</head>
<body>
  <header>
    <h1>Finnish Name Statistics</h1>
    <p class="meta">
      Data: ${this.escapeHtml(stats.dataSource)} |
      Period: ${stats.decadeRange.first}-${stats.decadeRange.last} |
      Generated: ${new Date(stats.generatedAt).toLocaleDateString("fi-FI")}
    </p>
  </header>

  <input class="tab-toggle" type="radio" name="tab" id="tab-overview" checked>
  <input class="tab-toggle" type="radio" name="tab" id="tab-leaderboards">
  <input class="tab-toggle" type="radio" name="tab" id="tab-dynamics">
  <input class="tab-toggle" type="radio" name="tab" id="tab-diversity">
  <input class="tab-toggle" type="radio" name="tab" id="tab-churn">
  <input class="tab-toggle" type="radio" name="tab" id="tab-gender">
  <input class="tab-toggle" type="radio" name="tab" id="tab-linguistics">

  <nav class="tabs" aria-label="Statistics sections">
    <label for="tab-overview">Overview</label>
    <label for="tab-leaderboards">Leaderboards</label>
    <label for="tab-dynamics">Dynamics</label>
    <label for="tab-diversity">Diversity</label>
    <label for="tab-churn">Churn</label>
    <label for="tab-gender">Gender</label>
    <label for="tab-linguistics">Linguistics</label>
  </nav>

  <main>
    <section id="overview" class="tab-content">${overview}</section>
    <section id="leaderboards" class="tab-content">${leaderboards}</section>
    <section id="dynamics" class="tab-content">${dynamics}</section>
    <section id="diversity" class="tab-content">${diversity}</section>
    <section id="churn" class="tab-content">${churn}</section>
    <section id="gender" class="tab-content">${gender}</section>
    <section id="linguistics" class="tab-content">${linguistics}</section>
  </main>

  <footer>
    <p>Data source: DVV (Digi- ja vaestotietovirasto) | Statistics based on Top 100 names per decade</p>
  </footer>
</body>
</html>`;
  }

  private generateCSS(): string {
    return `
:root {
  --max-width: 1100px;
  --color-bg: #f8f9fa;
  --color-text: #212529;
  --color-link: #0066cc;
  --color-border: #dee2e6;
  --color-card: #ffffff;
  --color-accent: #4361ee;
  --color-success: #2a9d8f;
  --color-warning: #e9c46a;
  --color-danger: #e76f51;
}

* { box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.5;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 1rem;
  background: var(--color-bg);
  color: var(--color-text);
}

a { color: var(--color-link); text-decoration: none; }
a:hover { text-decoration: underline; }

header {
  text-align: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid var(--color-border);
}

header h1 { margin: 0 0 0.5rem 0; font-size: 1.8rem; }
header .meta { color: #6c757d; font-size: 0.85rem; margin: 0; }

/* Tabs */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0;
}

.tab-toggle { display: none; }

.tabs label {
  padding: 0.5rem 1rem;
  cursor: pointer;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: #6c757d;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.tabs label:hover { background: var(--color-card); color: var(--color-text); }

#tab-overview:checked ~ .tabs label[for="tab-overview"],
#tab-leaderboards:checked ~ .tabs label[for="tab-leaderboards"],
#tab-dynamics:checked ~ .tabs label[for="tab-dynamics"],
#tab-diversity:checked ~ .tabs label[for="tab-diversity"],
#tab-churn:checked ~ .tabs label[for="tab-churn"],
#tab-gender:checked ~ .tabs label[for="tab-gender"],
#tab-linguistics:checked ~ .tabs label[for="tab-linguistics"] {
  background: var(--color-card);
  border-color: var(--color-border);
  color: var(--color-accent);
  font-weight: 500;
  margin-bottom: -2px;
  border-bottom: 2px solid var(--color-card);
}

.tab-content { display: none; }

#tab-overview:checked ~ main #overview,
#tab-leaderboards:checked ~ main #leaderboards,
#tab-dynamics:checked ~ main #dynamics,
#tab-diversity:checked ~ main #diversity,
#tab-churn:checked ~ main #churn,
#tab-gender:checked ~ main #gender,
#tab-linguistics:checked ~ main #linguistics { display: block; }

/* Cards */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.card {
  background: var(--color-card);
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.card h3 { margin: 0 0 0.5rem 0; font-size: 0.85rem; color: #6c757d; text-transform: uppercase; }
.card .value { font-size: 1.5rem; font-weight: 600; color: var(--color-accent); }
.card .sub { font-size: 0.8rem; color: #6c757d; margin-top: 0.25rem; }

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-card);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

th, td {
  padding: 0.6rem 0.8rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

th {
  background: #f1f3f4;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  color: #6c757d;
}

tr:last-child td { border-bottom: none; }
tr:hover { background: #f8f9fa; }

td.number { text-align: right; font-variant-numeric: tabular-nums; }
td.positive { color: var(--color-success); }
td.negative { color: var(--color-danger); }

/* Details/Summary */
details {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 1rem;
}

summary {
  padding: 1rem;
  cursor: pointer;
  font-weight: 500;
}

summary:hover { background: #f8f9fa; }
details[open] summary { border-bottom: 1px solid var(--color-border); }
details > div { padding: 1rem; }

/* Section headers */
.section-header {
  margin: 1.5rem 0 1rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.section-header h2 { margin: 0; font-size: 1.2rem; }
.section-header p { margin: 0.25rem 0 0 0; color: #6c757d; font-size: 0.85rem; }

/* Gender labels */
.gender-boy { color: #3498db; }
.gender-girl { color: #e91e63; }

/* Bar chart (CSS only) */
.bar-chart { margin: 1rem 0; }
.bar-row { display: flex; align-items: center; margin-bottom: 0.5rem; }
.bar-label { width: 80px; font-size: 0.85rem; }
.bar-container { flex: 1; height: 24px; background: #e9ecef; border-radius: 4px; overflow: hidden; }
.bar { height: 100%; background: var(--color-accent); border-radius: 4px; transition: width 0.3s; }
.bar-value { width: 60px; text-align: right; font-size: 0.85rem; margin-left: 0.5rem; }

/* Responsive */
@media (max-width: 768px) {
  .tabs { overflow-x: auto; flex-wrap: nowrap; }
  .tabs label { white-space: nowrap; font-size: 0.8rem; padding: 0.4rem 0.75rem; }
  .card-grid { grid-template-columns: repeat(2, 1fr); }
  table { font-size: 0.8rem; }
  th, td { padding: 0.4rem 0.5rem; }
}

@media print {
  .tabs { display: none; }
  .tab-content { display: block !important; page-break-inside: avoid; }
}
`;
  }

  private generateOverviewSection(stats: AllStats): string {
    const boyStats = stats.decadeStats.filter((s) => s.gender === "boy");
    const girlStats = stats.decadeStats.filter((s) => s.gender === "girl");

    const latestBoy = boyStats.find((s) => s.decade === "2020");
    const latestGirl = girlStats.find((s) => s.decade === "2020");

    // Find most evergreen names
    const topEvergreen = stats.evergreenNames.slice(0, 4);

    return `
      <div class="card-grid">
        <div class="card">
          <h3>Total Unique Names</h3>
          <div class="value">${this.formatNumber(stats.totalUniqueNames)}</div>
          <div class="sub">Across ${stats.decadeRange.first}-${stats.decadeRange.last}</div>
        </div>
        <div class="card">
          <h3>Total Records</h3>
          <div class="value">${this.formatNumber(stats.totalRecords)}</div>
          <div class="sub">Name-decade combinations</div>
        </div>
        <div class="card">
          <h3>Latest Decade (Boys)</h3>
          <div class="value">${this.formatNumber(latestBoy?.totalBirths ?? 0)}</div>
          <div class="sub">Top 100 births in 2020s</div>
        </div>
        <div class="card">
          <h3>Latest Decade (Girls)</h3>
          <div class="value">${this.formatNumber(latestGirl?.totalBirths ?? 0)}</div>
          <div class="sub">Top 100 births in 2020s</div>
        </div>
      </div>

      <div class="section-header">
        <h2>Most Enduring Names</h2>
        <p>Names that have remained in Top 100 for the most decades</p>
      </div>
      <table>
        <thead>
          <tr><th>Name</th><th>Gender</th><th>Decades</th><th>Avg Rank</th><th>Total Count</th></tr>
        </thead>
        <tbody>
          ${topEvergreen
            .map(
              (n) => `
            <tr>
              <td>${this.escapeHtml(n.name)}</td>
              <td class="gender-${n.gender}">${n.gender === "boy" ? "Boy" : "Girl"}</td>
              <td class="number">${n.decadesPresent}</td>
              <td class="number">${this.formatDecimal(n.avgRank, 1)}</td>
              <td class="number">${this.formatNumber(n.totalCount)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <div class="section-header">
        <h2>Current #1 Names by Decade</h2>
        <p>The most popular name for each decade</p>
      </div>
      <div class="card-grid">
        ${this.generateTop1ByDecade(stats.topNames, "boy")}
        ${this.generateTop1ByDecade(stats.topNames, "girl")}
      </div>
    `;
  }

  private generateTop1ByDecade(
    topNames: TopName[],
    gender: "boy" | "girl"
  ): string {
    const top1s = topNames.filter((n) => n.gender === gender && n.rank === 1);
    const recentTop1s = top1s.slice(-4);

    return recentTop1s
      .map(
        (n) => `
      <div class="card">
        <h3>${n.decade}s <span class="gender-${gender}">(${gender === "boy" ? "Boys" : "Girls"})</span></h3>
        <div class="value">${this.escapeHtml(n.name)}</div>
        <div class="sub">${this.formatNumber(n.count)} births (${this.formatPercent(n.share)})</div>
      </div>
    `
      )
      .join("");
  }

  private generateLeaderboardsSection(stats: AllStats): string {
    const decades = [...new Set(stats.decadeStats.map((s) => s.decade))].sort();

    const decadeSections = decades
      .slice(-5)
      .reverse()
      .map((decade) => {
        const boyNames = stats.topNames.filter(
          (n) => n.decade === decade && n.gender === "boy"
        );
        const girlNames = stats.topNames.filter(
          (n) => n.decade === decade && n.gender === "girl"
        );
        const boyStats = stats.decadeStats.find(
          (s) => s.decade === decade && s.gender === "boy"
        );
        const girlStats = stats.decadeStats.find(
          (s) => s.decade === decade && s.gender === "girl"
        );

        return `
        <details ${decade === "2020" ? "open" : ""}>
          <summary>${decade}s</summary>
          <div>
            <div class="card-grid">
              <div class="card">
                <h3>Top 1 Concentration (Boys)</h3>
                <div class="value">${this.formatPercent(boyStats?.topNConcentration.top1 ?? 0)}</div>
              </div>
              <div class="card">
                <h3>Top 10 Concentration (Boys)</h3>
                <div class="value">${this.formatPercent(boyStats?.topNConcentration.top10 ?? 0)}</div>
              </div>
              <div class="card">
                <h3>Top 1 Concentration (Girls)</h3>
                <div class="value">${this.formatPercent(girlStats?.topNConcentration.top1 ?? 0)}</div>
              </div>
              <div class="card">
                <h3>Top 10 Concentration (Girls)</h3>
                <div class="value">${this.formatPercent(girlStats?.topNConcentration.top10 ?? 0)}</div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div>
                <h4 class="gender-boy">Top 10 Boys</h4>
                <table>
                  <thead><tr><th>#</th><th>Name</th><th>Count</th><th>Share</th></tr></thead>
                  <tbody>
                    ${boyNames
                      .map(
                        (n) => `
                      <tr>
                        <td class="number">${n.rank}</td>
                        <td>${this.escapeHtml(n.name)}</td>
                        <td class="number">${this.formatNumber(n.count)}</td>
                        <td class="number">${this.formatPercent(n.share)}</td>
                      </tr>
                    `
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
              <div>
                <h4 class="gender-girl">Top 10 Girls</h4>
                <table>
                  <thead><tr><th>#</th><th>Name</th><th>Count</th><th>Share</th></tr></thead>
                  <tbody>
                    ${girlNames
                      .map(
                        (n) => `
                      <tr>
                        <td class="number">${n.rank}</td>
                        <td>${this.escapeHtml(n.name)}</td>
                        <td class="number">${this.formatNumber(n.count)}</td>
                        <td class="number">${this.formatPercent(n.share)}</td>
                      </tr>
                    `
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </details>
      `;
      })
      .join("");

    return `
      <div class="section-header">
        <h2>Name Leaderboards by Decade</h2>
        <p>Top 10 names and concentration metrics for each decade</p>
      </div>
      ${decadeSections}
    `;
  }

  private generateDynamicsSection(stats: AllStats): string {
    return `
      <div class="section-header">
        <h2>Biggest Climbers</h2>
        <p>Names that improved their rank the most between consecutive decades</p>
      </div>
      <table>
        <thead>
          <tr><th>Name</th><th>Gender</th><th>From</th><th>To</th><th>Change</th></tr>
        </thead>
        <tbody>
          ${stats.biggestClimbers
            .slice(0, 15)
            .map(
              (r) => `
            <tr>
              <td>${this.escapeHtml(r.name)}</td>
              <td class="gender-${r.gender}">${r.gender === "boy" ? "Boy" : "Girl"}</td>
              <td class="number">#${r.fromRank} (${r.fromDecade})</td>
              <td class="number">#${r.toRank} (${r.toDecade})</td>
              <td class="number positive">+${r.change}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <div class="section-header">
        <h2>Biggest Fallers</h2>
        <p>Names that dropped the most in rank between consecutive decades</p>
      </div>
      <table>
        <thead>
          <tr><th>Name</th><th>Gender</th><th>From</th><th>To</th><th>Change</th></tr>
        </thead>
        <tbody>
          ${stats.biggestFallers
            .slice(0, 15)
            .map(
              (r) => `
            <tr>
              <td>${this.escapeHtml(r.name)}</td>
              <td class="gender-${r.gender}">${r.gender === "boy" ? "Boy" : "Girl"}</td>
              <td class="number">#${r.fromRank} (${r.fromDecade})</td>
              <td class="number">#${r.toRank} (${r.toDecade})</td>
              <td class="number negative">${r.change}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <div class="section-header">
        <h2>Comebacks</h2>
        <p>Names that returned to Top 100 after being absent for at least one decade</p>
      </div>
      <table>
        <thead>
          <tr><th>Name</th><th>Gender</th><th>Comeback</th><th>Previous</th><th>Gap</th><th>Rank</th></tr>
        </thead>
        <tbody>
          ${stats.comebacks
            .slice(0, 15)
            .map(
              (c) => `
            <tr>
              <td>${this.escapeHtml(c.name)}</td>
              <td class="gender-${c.gender}">${c.gender === "boy" ? "Boy" : "Girl"}</td>
              <td class="number">${c.comebackDecade}</td>
              <td class="number">${c.previousDecade}</td>
              <td class="number">${c.gapDecades} decade${c.gapDecades > 1 ? "s" : ""}</td>
              <td class="number">#${c.comebackRank}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <div class="section-header">
        <h2>Most Stable Names</h2>
        <p>Names with the lowest rank variance (most consistent popularity)</p>
      </div>
      <table>
        <thead>
          <tr><th>Name</th><th>Gender</th><th>Avg Rank</th><th>Std Dev</th><th>Longevity</th></tr>
        </thead>
        <tbody>
          ${stats.nameDynamics
            .filter((n) => n.longevity >= 5)
            .sort((a, b) => a.rankStddev - b.rankStddev)
            .slice(0, 15)
            .map(
              (n) => `
            <tr>
              <td>${this.escapeHtml(n.name)}</td>
              <td class="gender-${n.gender}">${n.gender === "boy" ? "Boy" : "Girl"}</td>
              <td class="number">${this.formatDecimal(n.avgRank, 1)}</td>
              <td class="number">${this.formatDecimal(n.rankStddev, 2)}</td>
              <td class="number">${n.longevity} decades</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  private generateDiversitySection(stats: AllStats): string {
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
              <td class="number">${this.formatDecimal(s.hhi, 4)}</td>
              <td class="number">${this.formatDecimal(s.effectiveNames, 1)}</td>
              <td class="number">${this.formatDecimal(s.entropy, 3)}</td>
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
              <td class="number">${this.formatDecimal(s.hhi, 4)}</td>
              <td class="number">${this.formatDecimal(s.effectiveNames, 1)}</td>
              <td class="number">${this.formatDecimal(s.entropy, 3)}</td>
              <td class="number">${s.namesToReach.pct50}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  private generateChurnSection(stats: AllStats): string {
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
              <td class="number">${this.formatPercent(c.churnRate)}</td>
              <td class="number">${this.formatDecimal(c.jaccardSimilarity, 3)}</td>
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
              <td class="number">${this.formatPercent(c.churnRate)}</td>
              <td class="number">${this.formatDecimal(c.jaccardSimilarity, 3)}</td>
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
              <td>${this.escapeHtml(n.name)}</td>
              <td class="gender-${n.gender}">${n.gender === "boy" ? "Boy" : "Girl"}</td>
              <td class="number">${n.decadesPresent}</td>
              <td class="number">${this.formatDecimal(n.avgRank, 1)}</td>
              <td class="number">${this.formatNumber(n.totalCount)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  private generateGenderSection(stats: AllStats): string {
    // Group unisex names by decade, show most recent first
    const unisexByDecade = new Map<string, UnisexName[]>();
    for (const name of stats.unisexNames) {
      const existing = unisexByDecade.get(name.decade);
      if (existing) {
        existing.push(name);
      } else {
        unisexByDecade.set(name.decade, [name]);
      }
    }

    const decades = [...unisexByDecade.keys()].sort().reverse().slice(0, 5);

    return `
      <div class="section-header">
        <h2>Unisex Names</h2>
        <p>Names that appear in both boys' and girls' Top 100 in the same decade</p>
      </div>

      ${decades
        .map((decade) => {
          const names = unisexByDecade.get(decade) ?? [];
          if (names.length === 0) return "";

          return `
          <details ${decade === "2020" ? "open" : ""}>
            <summary>${decade}s (${names.length} unisex names)</summary>
            <div>
              <table>
                <thead>
                  <tr><th>Name</th><th>Boy Rank</th><th>Girl Rank</th><th>Boy Count</th><th>Girl Count</th></tr>
                </thead>
                <tbody>
                  ${names
                    .map(
                      (n) => `
                    <tr>
                      <td>${this.escapeHtml(n.name)}</td>
                      <td class="number">#${n.boyRank}</td>
                      <td class="number">#${n.girlRank}</td>
                      <td class="number">${this.formatNumber(n.boyCount)}</td>
                      <td class="number">${this.formatNumber(n.girlCount)}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </details>
        `;
        })
        .join("")}

      <div class="section-header">
        <h2>Unisex Names Over Time</h2>
        <p>Count of names appearing in both genders' Top 100 per decade</p>
      </div>
      ${this.generateUnisexTrendBar(stats.unisexNames)}
    `;
  }

  private generateUnisexTrendBar(unisexNames: UnisexName[]): string {
    const countByDecade = new Map<string, number>();
    for (const n of unisexNames) {
      countByDecade.set(n.decade, (countByDecade.get(n.decade) ?? 0) + 1);
    }

    const decades = [...countByDecade.keys()].sort();
    const maxCount = Math.max(...countByDecade.values());

    return `
      <div class="bar-chart">
        ${decades
          .map((decade) => {
            const count = countByDecade.get(decade) ?? 0;
            const width = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return `
            <div class="bar-row">
              <span class="bar-label">${decade}</span>
              <div class="bar-container">
                <div class="bar" style="width: ${width}%"></div>
              </div>
              <span class="bar-value">${count}</span>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  private generateLinguisticsSection(stats: AllStats): string {
    // Letter stats - aggregate latest decade
    const latestLetters = stats.letterStats.filter((l) => l.decade === "2020");
    const boyLetters = latestLetters
      .filter((l) => l.gender === "boy")
      .sort((a, b) => b.share - a.share);
    const girlLetters = latestLetters
      .filter((l) => l.gender === "girl")
      .sort((a, b) => b.share - a.share);

    // Suffix stats - latest decade
    const latestSuffixes = stats.suffixStats.filter((s) => s.decade === "2020");
    const boySuffixes = latestSuffixes
      .filter((s) => s.gender === "boy")
      .sort((a, b) => b.share - a.share);
    const girlSuffixes = latestSuffixes
      .filter((s) => s.gender === "girl")
      .sort((a, b) => b.share - a.share);

    // Name length trend
    const boyLength = stats.nameLengthStats
      .filter((s) => s.gender === "boy")
      .sort((a, b) => a.decade.localeCompare(b.decade));
    const girlLength = stats.nameLengthStats
      .filter((s) => s.gender === "girl")
      .sort((a, b) => a.decade.localeCompare(b.decade));

    return `
      <div class="section-header">
        <h2>Initial Letter Distribution (2020s)</h2>
        <p>Most common starting letters by total births</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div>
          <h4 class="gender-boy">Boys</h4>
          ${this.generateLetterBars(boyLetters.slice(0, 10))}
        </div>
        <div>
          <h4 class="gender-girl">Girls</h4>
          ${this.generateLetterBars(girlLetters.slice(0, 10))}
        </div>
      </div>

      <div class="section-header">
        <h2>Name Endings (2020s)</h2>
        <p>Common Finnish name suffixes by total births</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div>
          <h4 class="gender-boy">Boys</h4>
          <table>
            <thead><tr><th>Suffix</th><th>Names</th><th>Share</th></tr></thead>
            <tbody>
              ${boySuffixes
                .map(
                  (s) => `
                <tr>
                  <td>${this.escapeHtml(s.suffix)}</td>
                  <td class="number">${s.nameCount}</td>
                  <td class="number">${this.formatPercent(s.share)}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div>
          <h4 class="gender-girl">Girls</h4>
          <table>
            <thead><tr><th>Suffix</th><th>Names</th><th>Share</th></tr></thead>
            <tbody>
              ${girlSuffixes
                .map(
                  (s) => `
                <tr>
                  <td>${this.escapeHtml(s.suffix)}</td>
                  <td class="number">${s.nameCount}</td>
                  <td class="number">${this.formatPercent(s.share)}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="section-header">
        <h2>Average Name Length Over Time</h2>
      </div>
      <table>
        <thead>
          <tr><th>Decade</th><th>Boys Avg</th><th>Girls Avg</th></tr>
        </thead>
        <tbody>
          ${boyLength
            .map((b, i) => {
              const g = girlLength[i];
              return `
              <tr>
                <td>${b.decade}</td>
                <td class="number">${this.formatDecimal(b.avgLength, 2)}</td>
                <td class="number">${this.formatDecimal(g?.avgLength ?? 0, 2)}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>

      <div class="section-header">
        <h2>Finnish Special Characters (a, o)</h2>
        <p>Percentage of names containing a or o</p>
      </div>
      <table>
        <thead>
          <tr><th>Decade</th><th>Boys a</th><th>Boys o</th><th>Girls a</th><th>Girls o</th></tr>
        </thead>
        <tbody>
          ${stats.specialCharStats
            .filter((s) => s.gender === "boy")
            .sort((a, b) => a.decade.localeCompare(b.decade))
            .map((b) => {
              const g = stats.specialCharStats.find(
                (s) => s.decade === b.decade && s.gender === "girl"
              );
              return `
              <tr>
                <td>${b.decade}</td>
                <td class="number">${this.formatPercent(b.umlautAShare)}</td>
                <td class="number">${this.formatPercent(b.umlautOShare)}</td>
                <td class="number">${this.formatPercent(g?.umlautAShare ?? 0)}</td>
                <td class="number">${this.formatPercent(g?.umlautOShare ?? 0)}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  private generateLetterBars(letters: LetterStats[]): string {
    const firstLetter = letters[0];
    const maxShare = firstLetter ? firstLetter.share : 0;

    return `
      <div class="bar-chart">
        ${letters
          .map((l) => {
            const width = maxShare > 0 ? (l.share / maxShare) * 100 : 0;
            return `
            <div class="bar-row">
              <span class="bar-label">${this.escapeHtml(l.letter)}</span>
              <div class="bar-container">
                <div class="bar" style="width: ${width}%"></div>
              </div>
              <span class="bar-value">${this.formatPercent(l.share)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }
}
