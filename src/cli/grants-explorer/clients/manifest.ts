import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { MANIFEST_FILE } from "../constants";
import type { SectorManifest } from "../types/schemas";
import { SectorManifestSchema } from "../types/schemas";

const manifestPath = (dir: string): string => join(dir, MANIFEST_FILE);

/**
 * Reads and validates `<dir>/sectors.json`. Throws on missing file, malformed
 * JSON, or shape that doesn't match SectorManifestSchema — the cached state
 * is opaque without a valid manifest, so we'd rather fail loudly than load a
 * silently-incomplete dataset.
 */
export const readManifest = async (dir: string): Promise<SectorManifest> => {
  const raw = await readFile(manifestPath(dir), "utf8");
  const parsed: unknown = JSON.parse(raw);
  return SectorManifestSchema.parse(parsed);
};

export const writeManifest = async (
  dir: string,
  manifest: SectorManifest
): Promise<void> => {
  // Validate before writing so a corrupted in-memory list can't poison the
  // on-disk cache. Pretty-print for easier diffing when the source upstream
  // adds a new sektoriluokitus code.
  const validated = SectorManifestSchema.parse(manifest);
  await writeFile(
    manifestPath(dir),
    `${JSON.stringify(validated, null, 2)}\n`,
    "utf8"
  );
};
