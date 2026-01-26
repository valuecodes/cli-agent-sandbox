import fs from "node:fs/promises";
import { tool } from "@openai/agents";
import type { Logger } from "~clients/logger";
import { resolveTmpPathForRead } from "~tools/utils/fs";

export type ReadFileToolOptions = {
  logger: Logger;
};

export const createReadFileTool = ({ logger }: ReadFileToolOptions) =>
  tool({
    name: "readFile",
    description:
      "Reads content from a file under the repo tmp directory (path is relative to tmp).",
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
      logger.tool("Reading file", { path: filePath });
      const targetPath = await resolveTmpPathForRead(filePath);
      logger.tool("Read file result", { targetPath });
      return fs.readFile(targetPath, "utf8");
    },
  });
