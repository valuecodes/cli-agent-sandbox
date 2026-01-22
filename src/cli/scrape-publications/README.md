# Scrape Publications CLI

Scrapes a target page for publication links, infers selectors, fetches publication pages, extracts content, and generates a review page.

## Run

```
pnpm run:scrape-publications -- --url="https://example.com" [--refetch] [--filterUrl="substring"]
```

## Arguments

- `--url` (required): target page to scrape.
- `--refetch` (optional): re-fetch cached artifacts.
- `--filterUrl` (optional): keep only links containing this substring.

## Output

Writes under `tmp/scraped-publications/<url-slug>/`, including `review.html`.

## Flowchart

```mermaid
flowchart TD
  A[Start: run CLI] --> B[Parse + validate args (zod)]
  B --> C[Derive output path (slugify URL)]
  C --> D[Init PublicationPipeline]
  D --> E[Fetch source HTML]
  E --> F{Filter substring?}
  F -->|--filterUrl| G[Use provided substring]
  F -->|prompt| H[Ask user for substring]
  G --> I[Discover link candidates]
  H --> I[Discover link candidates]
  I --> J{Playwright found none?}
  J -->|yes| K[Fallback to basic HTTP]
  J -->|no| L[Use Playwright results]
  K --> M[Identify selectors + extract metadata]
  L --> M[Identify selectors + extract metadata]
  M --> N[Fetch publication pages]
  N --> O[Extract publication content]
  O --> P{Any content?}
  P -->|yes| Q[Generate review.html]
  P -->|no| R[Skip review page]
  Q --> S[Close pipeline]
  R --> S[Close pipeline]
  S --> T[Done]
```

## Notes

Uses Playwright for JavaScript-rendered pages and falls back to basic HTTP fetch if no candidates are found.
