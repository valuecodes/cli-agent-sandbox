import { z } from "zod";

export const CliArgsSchema = z.object({
  dir: z.string().optional(),
  // Presence-only flag. parseArgv hands us bare `true` for `--refetch` and
  // `undefined` when absent. Any `--refetch=<value>` form arrives as a string
  // and is rejected here — preventing the historical `z.coerce.boolean()`
  // foot-gun where `--refetch=false` would silently *enable* refetch and
  // clobber the cached workbook.
  refetch: z.boolean().default(false),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;

// OpenAI structured outputs doesn't allow union/anyOf at the root.
// We use one flat schema where `content` holds either the answer or
// a clarifying question, distinguished by `status`.
export const GrantsAgentOutputTypeSchema = z.object({
  response: z.object({
    status: z.enum(["final", "needs_clarification"]),
    content: z.string().min(1),
  }),
});

export const GrantsAgentOutputSchema = GrantsAgentOutputTypeSchema;

export type GrantsAgentOutput = z.infer<typeof GrantsAgentOutputSchema>;

// Sektoriluokitus = Finnish institutional sector classification (S11–S15, plus
// sub-codes). Each sector's grants are exported as a separate xlsx; the manifest
// (sectors.json) records the code/label pairs the downloader discovered, so the
// loader can tag rows back to their sector at insert time.
// Sektoriluokitus code: either a real S-code (S2..S131311 — 1 to 6 digits)
// or one of the two sentinel buckets for rows with no sector (BLANK = null
// value, PUUTTUU = the source's explicit "Sektoriluokitus puuttuu").
const SECTOR_CODE_RE = /^(S\d{1,6}|BLANK|PUUTTUU)$/;

export const SectorSchema = z.object({
  code: z.string().regex(SECTOR_CODE_RE),
  label: z.string().min(1),
});
export type Sector = z.infer<typeof SectorSchema>;

export const SectorManifestSchema = z.array(SectorSchema).min(1);
export type SectorManifest = z.infer<typeof SectorManifestSchema>;

// Single source of truth for one row loaded from the xlsx. Used as a runtime
// validation tripwire in XlsxLoader: if the per-cell normalizers ever produce
// a value that violates this shape (off-by-one bug, schema drift, etc.), the
// loader logs the failing row instead of silently inserting garbage into SQL.
export const GrantRowSchema = z.object({
  decision_date: z.string().nullable(),
  recipient: z.string().nullable(),
  // Y-tunnus (Finnish Business ID) extracted from `recipient` parens. The
  // regex constraint can never reject a legitimately-loaded row — the loader
  // emits only matching values or null — but it serves as a tripwire if a
  // future refactor accidentally pipes the wrong field in.
  recipient_business_id: z
    .string()
    .regex(/^\d{7}-\d$/)
    .nullable(),
  granting_authority: z.string().nullable(),
  case_number: z.string().nullable(),
  amount_applied: z.number().int().nullable(),
  amount_granted: z.number().int().nullable(),
  has_eu_funding: z.union([z.literal(0), z.literal(1)]),
  purpose: z.string().nullable(),
  programme: z.string().nullable(),
  region: z.string().nullable(),
  // Sektoriluokitus tag attached by XlsxLoader from the sector manifest.
  // Both fields are required (every row originates from one sector's xlsx).
  sektoriluokitus_code: z.string().regex(SECTOR_CODE_RE),
  sektoriluokitus_label: z.string().min(1),
});

export type GrantRow = z.infer<typeof GrantRowSchema>;
