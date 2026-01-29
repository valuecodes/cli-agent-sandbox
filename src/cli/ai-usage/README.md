# AI Usage CLI

Summarize Claude and Codex token usage for a repo, including estimated costs from
`ai-usage.pricing.json`.

## Run

```bash
# Default: last 7 days for current git repo (or cwd if not in git)
pnpm ai:usage

# With options
pnpm ai:usage --since 24h
pnpm ai:usage --since 30d --repo /path/to/repo
pnpm ai:usage --json
pnpm ai:usage --debug
```

## Arguments

- `--since` (optional): time window to include. One of `1h`, `24h`, `7d`, `30d`.
- `--repo` (optional): path to repo to match against log cwd.
- `--json` (optional): emit JSON instead of the summary + table.
- `--debug` (optional): verbose logging about discovery and filtering.

## Log Sources

- **Claude:** `~/.claude/projects/<encoded-repo>/` JSONL logs
- **Codex:** `$CODEX_HOME/sessions` or `~/.codex/sessions` (YYYY/MM/DD folders)

Only entries whose `cwd` matches the repo path are counted.

## Output

- Summary by provider and by model.
- Markdown table with input/output/cache tokens, totals, and estimated cost.
- If a model is missing from `ai-usage.pricing.json`, cost is `0` and a warning is printed.

## Example Result

```text
AI Usage Summary (Last 30d)

By Provider:
  claude: 314,925 tokens ($223.49)
  codex: 38,018,298 tokens ($80.22)

By Model:
  gpt-5.2-codex: 37,582,714 tokens ($80.09)
  gpt-5.1-codex-mini: 435,584 tokens ($0.12)
  claude-opus-4-5-20251101: 314,925 tokens ($223.49)

| Provider | Model                    |      Input |  Output |     Cache R |    Cache W |      Total | Est. Cost |
|----------|--------------------------|------------|---------|-------------|------------|------------|-----------|
| claude   | claude-opus-4-5-20251101 |    267,897 |  47,028 | 202,979,575 | 11,948,269 |    314,925 |   $223.49 |
| codex    | gpt-5.2-codex            | 36,901,025 | 681,689 |  34,124,288 |          0 | 37,582,714 |    $80.09 |
| codex    | gpt-5.1-codex-mini       |    430,304 |   5,280 |     189,440 |          0 |    435,584 |     $0.12 |
|----------|--------------------------|------------|---------|-------------|------------|------------|-----------|
| TOTAL    |                          | 37,599,226 | 733,997 | 237,293,303 | 11,948,269 | 38,333,223 |   $303.70 |
```
