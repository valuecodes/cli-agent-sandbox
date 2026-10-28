// Inlined into the generated page's <style>; CSS-only tabs rely on the
// `.tab-toggle` radio inputs preceding `.tabs` and `main` as siblings.
const STATS_PAGE_CSS = `
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

export { STATS_PAGE_CSS };
