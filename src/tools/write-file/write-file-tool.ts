import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "@openai/agents";
import type { Logger } from "~clients/logger";
import { resolveTmpPathForWrite, TMP_ROOT } from "~tools/utils/fs";

export type WriteFileToolOptions = {
  logger: Logger;
};

export const createWriteFileTool = ({ logger }: WriteFileToolOptions) =>
  tool({
    name: "writeFile",
    description:
      "Writes content to a file under the repo tmp directory (path is relative to tmp).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path within the repo tmp directory",
        },
        content: { type: "string", description: "The content to write" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    execute: async ({
      path: filePath,
      content,
    }: {
      path: string;
      content: string;
    }) => {
      logger.tool(`Writing file: ${filePath}`);
      const targetPath = await resolveTmpPathForWrite(filePath);
      await fs.writeFile(targetPath, content, "utf8");
      const relativePath = path.relative(TMP_ROOT, targetPath);
      const bytes = Buffer.byteLength(content, "utf8");
      logger.tool(`Wrote ${bytes} bytes to tmp/${relativePath}`);
      return `Wrote ${bytes} bytes to tmp/${relativePath}`;
    },
  });
