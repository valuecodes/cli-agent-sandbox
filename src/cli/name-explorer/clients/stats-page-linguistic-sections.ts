import type { AllStats, LetterStats, UnisexName } from "../types/stats";
import {
  escapeHtml,
  formatDecimal,
  formatNumber,
  formatPercent,
} from "./stats-page-format";

const generateUnisexTrendBar = (unisexNames: UnisexName[]): string => {
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
};

const generateGenderSection = (stats: AllStats): string => {
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
          if (names.length === 0) {
            return "";
          }

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
                      <td>${escapeHtml(n.name)}</td>
                      <td class="number">#${n.boyRank}</td>
                      <td class="number">#${n.girlRank}</td>
                      <td class="number">${formatNumber(n.boyCount)}</td>
                      <td class="number">${formatNumber(n.girlCount)}</td>
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
      ${generateUnisexTrendBar(stats.unisexNames)}
    `;
};

const generateLetterBars = (letters: LetterStats[]): string => {
  const firstLetter = letters[0];
  const maxShare = firstLetter ? firstLetter.share : 0;

  return `
      <div class="bar-chart">
        ${letters
          .map((l) => {
            const width = maxShare > 0 ? (l.share / maxShare) * 100 : 0;
            return `
            <div class="bar-row">
              <span class="bar-label">${escapeHtml(l.letter)}</span>
              <div class="bar-container">
                <div class="bar" style="width: ${width}%"></div>
              </div>
              <span class="bar-value">${formatPercent(l.share)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
};

const generateLinguisticsSection = (stats: AllStats): string => {
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
          ${generateLetterBars(boyLetters.slice(0, 10))}
        </div>
        <div>
          <h4 class="gender-girl">Girls</h4>
          ${generateLetterBars(girlLetters.slice(0, 10))}
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
                  <td>${escapeHtml(s.suffix)}</td>
                  <td class="number">${s.nameCount}</td>
                  <td class="number">${formatPercent(s.share)}</td>
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
                  <td>${escapeHtml(s.suffix)}</td>
                  <td class="number">${s.nameCount}</td>
                  <td class="number">${formatPercent(s.share)}</td>
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
                <td class="number">${formatDecimal(b.avgLength, 2)}</td>
                <td class="number">${formatDecimal(g?.avgLength ?? 0, 2)}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>

      <div class="section-header">
        <h2>Finnish Special Characters (ä, ö)</h2>
        <p>Percentage of names containing ä or ö</p>
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
                <td class="number">${formatPercent(b.umlautAShare)}</td>
                <td class="number">${formatPercent(b.umlautOShare)}</td>
                <td class="number">${formatPercent(g?.umlautAShare ?? 0)}</td>
                <td class="number">${formatPercent(g?.umlautOShare ?? 0)}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    `;
};

export { generateGenderSection, generateLinguisticsSection };
