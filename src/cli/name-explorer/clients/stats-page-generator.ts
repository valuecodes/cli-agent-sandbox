import type { Logger } from "~clients/logger";

import type { AllStats, TopName } from "../types/stats";
import {
  escapeHtml,
  formatDecimal,
  formatNumber,
  formatPercent,
} from "./stats-page-format";
import {
  generateGenderSection,
  generateLinguisticsSection,
} from "./stats-page-linguistic-sections";
import { STATS_PAGE_CSS } from "./stats-page-styles";
import {
  generateChurnSection,
  generateDiversitySection,
} from "./stats-page-trend-sections";

type StatsPageGeneratorConfig = {
  logger: Logger;
};

class StatsPageGenerator {
  private readonly logger: Logger;

  constructor(config: StatsPageGeneratorConfig) {
    this.logger = config.logger;
  }

  generate(stats: AllStats): string {
    this.logger.info("Generating statistics HTML page");

    const css = STATS_PAGE_CSS;
    const overview = this.generateOverviewSection(stats);
    const leaderboards = this.generateLeaderboardsSection(stats);
    const dynamics = this.generateDynamicsSection(stats);
    const diversity = generateDiversitySection(stats);
    const churn = generateChurnSection(stats);
    const gender = generateGenderSection(stats);
    const linguistics = generateLinguisticsSection(stats);

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
      Data: ${escapeHtml(stats.dataSource)} |
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
          <div class="value">${formatNumber(stats.totalUniqueNames)}</div>
          <div class="sub">Across ${stats.decadeRange.first}-${stats.decadeRange.last}</div>
        </div>
        <div class="card">
          <h3>Total Records</h3>
          <div class="value">${formatNumber(stats.totalRecords)}</div>
          <div class="sub">Name-decade combinations</div>
        </div>
        <div class="card">
          <h3>Latest Decade (Boys)</h3>
          <div class="value">${formatNumber(latestBoy?.totalBirths ?? 0)}</div>
          <div class="sub">Top 100 births in 2020s</div>
        </div>
        <div class="card">
          <h3>Latest Decade (Girls)</h3>
          <div class="value">${formatNumber(latestGirl?.totalBirths ?? 0)}</div>
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
        <div class="value">${escapeHtml(n.name)}</div>
        <div class="sub">${formatNumber(n.count)} births (${formatPercent(n.share)})</div>
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
                <div class="value">${formatPercent(boyStats?.topNConcentration.top1 ?? 0)}</div>
              </div>
              <div class="card">
                <h3>Top 10 Concentration (Boys)</h3>
                <div class="value">${formatPercent(boyStats?.topNConcentration.top10 ?? 0)}</div>
              </div>
              <div class="card">
                <h3>Top 1 Concentration (Girls)</h3>
                <div class="value">${formatPercent(girlStats?.topNConcentration.top1 ?? 0)}</div>
              </div>
              <div class="card">
                <h3>Top 10 Concentration (Girls)</h3>
                <div class="value">${formatPercent(girlStats?.topNConcentration.top10 ?? 0)}</div>
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
                        <td>${escapeHtml(n.name)}</td>
                        <td class="number">${formatNumber(n.count)}</td>
                        <td class="number">${formatPercent(n.share)}</td>
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
                        <td>${escapeHtml(n.name)}</td>
                        <td class="number">${formatNumber(n.count)}</td>
                        <td class="number">${formatPercent(n.share)}</td>
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
              <td>${escapeHtml(r.name)}</td>
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
              <td>${escapeHtml(r.name)}</td>
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
              <td>${escapeHtml(c.name)}</td>
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
              <td>${escapeHtml(n.name)}</td>
              <td class="gender-${n.gender}">${n.gender === "boy" ? "Boy" : "Girl"}</td>
              <td class="number">${formatDecimal(n.avgRank, 1)}</td>
              <td class="number">${formatDecimal(n.rankStddev, 2)}</td>
              <td class="number">${n.longevity} decades</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }
}

export type { StatsPageGeneratorConfig };
export { StatsPageGenerator };
