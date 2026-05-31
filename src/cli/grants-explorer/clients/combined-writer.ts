import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import type { Logger } from "~clients/logger";

import type { GrantRow } from "../types/schemas";

export type WriteCombinedGrantsOptions = {
  logger: Logger;
  path: string;
  rows: GrantRow[];
};

/**
 * Serialize the full GrantRow[] to a single pretty-printed JSON array at
 * `path`. Writes to a sibling temp file first and renames into place so a
 * crash mid-write never leaves a half-written 50 MB blob at the canonical
 * path (which would silently look "complete" to downstream tools).
 *
 * No schema validation here — rows come straight out of XlsxLoader which
 * already validates via GrantRowSchema; re-validating 150k rows on write
 * would just burn CPU. The round-trip test pins the on-disk shape.
 */
export const writeCombinedGrants = async ({
  logger,
  path,
  rows,
}: WriteCombinedGrantsOptions): Promise<void> => {
  const tempPath = `${path}.tmp-${randomUUID().slice(0, 8)}`;
  try {
    await writeFile(tempPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
    await rename(tempPath, path);
    logger.info("Wrote combined grants JSON", {
      path,
      rowCount: rows.length,
    });
  } catch (error) {
    await unlink(tempPath).catch(() => {
      // intentional: temp may not exist yet (failure before writeFile)
    });
    throw error;
  }
};
