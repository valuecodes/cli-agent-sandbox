import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@openai/agents";
import type { Logger } from "~clients/logger";
import { resolveTmpPathForList, TMP_ROOT } from "~tools/utils/fs";

export type ListFilesToolOptions = {
  logger: Logger;
};

export const createListFilesTool = ({ logger }: ListFilesToolOptions) =>
  tool({
    name: "listFiles",
    description:
      "Lists files and directories under the repo tmp directory (path is relative to tmp). If no path provided, lists root of tmp.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            'Relative path within the repo tmp directory. Use empty string "" to list tmp root.',
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async ({ path: dirPath }: { path: string }) => {
      const effectivePath = dirPath || undefined;
      logger.tool("Listing files", { path: effectivePath ?? "tmp root" });
      const targetPath = await resolveTmpPathForList(effectivePath);

      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const lines = entries.map((entry) => {
        const type = entry.isDirectory() ? "[dir] " : "[file]";
        return `${type} ${entry.name}`;
      });

      const relativePath = path.relative(TMP_ROOT, targetPath);
      const displayPath = relativePath || "tmp";
      logger.tool("Listed entries", {
        count: entries.length,
        displayPath,
      });
      return lines.length > 0
        ? `Contents of ${displayPath}:\n${lines.join("\n")}`
        : `${displayPath} is empty`;
    },
  });
