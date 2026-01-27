import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@openai/agents";
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
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path within the repo tmp directory",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async ({ path: filePath }: { path: string }) => {
      logger.tool("Deleting file", { path: filePath });
      const targetPath = await resolveTmpPathForDelete(filePath);
      await fs.unlink(targetPath);
      const relativePath = path.relative(TMP_ROOT, targetPath);
      const displayPath = path.join("tmp", relativePath);
      logger.tool("Deleted file", { path: displayPath });
      return `Deleted ${displayPath}`;
    },
  });
