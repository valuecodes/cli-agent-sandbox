import { tool } from "@openai/agents";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Logger } from "~clients/logger";
import { resolveTmpPathForDelete, TMP_ROOT } from "~tools/utils/fs";

export type DeleteFileToolOptions = {
  logger: Logger;
};

export const createDeleteFileTool = ({ logger }: DeleteFileToolOptions) =>
  tool({
    name: "deleteFile",
    description:
      "Deletes a file under the repo tmp directory (path is relative to tmp).",
    parameters: z.object({
      path: z.string().describe("Relative path within the repo tmp directory"),
    }),
    execute: async ({ path: filePath }) => {
      logger.tool("Deleting file", { path: filePath });
      const targetPath = await resolveTmpPathForDelete(filePath);
      await fs.unlink(targetPath);
      const relativePath = path.relative(TMP_ROOT, targetPath);
      const displayPath = path.join("tmp", relativePath);
      logger.tool("Deleted file", { path: displayPath });
      return `Deleted ${displayPath}`;
    },
  });
