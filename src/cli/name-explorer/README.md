# Name Explorer CLI

Interactive CLI for exploring Finnish name statistics with an AI Q&A mode and a stats report generator.

![Name Explorer demo](./demo-1.png)

## Run

```
pnpm run:name-explorer -- [--mode ai|stats] [--refetch]
```

## Modes

- `ai` (default): interactive Q&A over Finnish name data using an OpenAI agent with SQL tools.
- `stats`: compute summary metrics and generate an HTML report.

## Arguments

- `--mode` (optional): `ai` or `stats`. Defaults to `ai`.
- `--refetch` (optional): re-download all decade pages and rebuild cached artifacts.

## Output

Writes under `tmp/name-explorer/`:

- `raw/`: per-decade cached HTML, Markdown, and parsed JSON
- `all-names.json`: consolidated dataset used on subsequent runs
- `statistics.html`: generated when running in `--mode stats`

## Data sources

- DVV (Digi- ja vaestotietovirasto) top 100 first names by decade (1889-2020), split by boys/girls.
- Optional aggregated totals: if you place `etunimi-miehet.csv` and/or `etunimi-naiset.csv` in `tmp/name-explorer/`, the AI mode also loads an aggregated names database.

## Notes

- AI mode requires `OPENAI_API_KEY` in your environment.
- Type `exit`, `quit`, or `q` to leave the interactive prompt.
