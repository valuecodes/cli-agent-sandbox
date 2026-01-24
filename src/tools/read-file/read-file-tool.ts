import fs from "node:fs/promises";
import { tool } from "@openai/agents";
import { resolveTmpPathForRead } from "~tools/utils/fs";

export const readFileTool = tool({
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
    console.log("Reading file at path:", filePath);
    const targetPath = await resolveTmpPathForRead(filePath);
    console.log("Resolved target path:", targetPath);
    return fs.readFile(targetPath, "utf8");
  },
});
