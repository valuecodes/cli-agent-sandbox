import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@openai/agents";
import type { Logger } from "~clients/logger";
import { resolveTmpPathForRead, TMP_ROOT } from "~tools/utils/fs";
import { z } from "zod";

export type ReadFileToolOptions = {
  logger: Logger;
};

export const createReadFileTool = ({ logger }: ReadFileToolOptions) =>
  tool({
    name: "readFile",
    description:
      "Reads content from a file under the repo tmp directory (path is relative to tmp).",
    parameters: z.object({
      path: z.string().describe("Relative path within the repo tmp directory"),
    }),
    execute: async ({ path: filePath }) => {
      logger.tool("Reading file", { path: filePath });
      const targetPath = await resolveTmpPathForRead(filePath);
      const relativePath = path.relative(TMP_ROOT, targetPath);
      const displayPath = path.join("tmp", relativePath);
      logger.tool("Read file result", { targetPath: displayPath });
      return fs.readFile(targetPath, "utf8");
    },
  });
