import type { Tool } from "@openai/agents";
import type { Logger } from "~clients/logger";
import { createListFilesTool } from "~tools/list-files/list-files-tool";
import { createReadFileTool } from "~tools/read-file/read-file-tool";
import { createWriteFileTool } from "~tools/write-file/write-file-tool";

export type ToolFactoryConfig = {
  logger: Logger;
};

type ToolFactory = (config: ToolFactoryConfig) => Tool;

const toolFactories: Record<string, ToolFactory> = {
  readFile: ({ logger }) => createReadFileTool({ logger }),
  writeFile: ({ logger }) => createWriteFileTool({ logger }),
  listFiles: ({ logger }) => createListFilesTool({ logger }),
};

/**
 * Creates tool instances from an array of tool names.
 * Throws if an unknown tool name is provided.
 */
export const createToolsFromNames = (
  names: string[],
  config: ToolFactoryConfig
): Tool[] => {
  return names.map((name) => {
    const factory = toolFactories[name];
    if (!factory) {
      const available = Object.keys(toolFactories).join(", ");
      throw new Error(`Unknown tool: ${name}. Available: ${available}`);
    }
    return factory(config);
  });
};
