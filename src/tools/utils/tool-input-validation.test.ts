import { createDeleteFileTool } from "~tools/delete-file/delete-file-tool";
import { createFetchUrlTool } from "~tools/fetch-url/fetch-url-tool";
import { createListFilesTool } from "~tools/list-files/list-files-tool";
import { createReadFileTool } from "~tools/read-file/read-file-tool";
import { createRunPythonTool } from "~tools/run-python/run-python-tool";
import { invokeTool } from "~tools/utils/test-utils";
import { createWriteFileTool } from "~tools/write-file/write-file-tool";
import { describe, expect, it, vi } from "vitest";

// The zod parameter schemas are the only runtime guard on model-supplied tool
// arguments. Every tool's execute logs via `logger.tool` first, so an untouched
// spy proves the handler never ran on malformed input.
describe("sandbox tool input validation", () => {
  const cases = [
    { tool: "readFile", create: createReadFileTool, input: {} },
    { tool: "readFile", create: createReadFileTool, input: { path: 1 } },
    {
      tool: "writeFile",
      create: createWriteFileTool,
      input: { path: "x.txt" },
    },
    {
      tool: "writeFile",
      create: createWriteFileTool,
      input: { path: "x.txt", content: 5 },
    },
    { tool: "listFiles", create: createListFilesTool, input: {} },
    { tool: "deleteFile", create: createDeleteFileTool, input: { path: 1 } },
    {
      tool: "runPython",
      create: ({ logger }: { logger: never }) =>
        createRunPythonTool({ scriptsDir: "/nonexistent", logger }),
      input: { scriptName: "hello.py" },
    },
    { tool: "fetchUrl", create: createFetchUrlTool, input: {} },
    {
      tool: "fetchUrl",
      create: createFetchUrlTool,
      input: { url: "https://example.com", timeoutMs: "fast" },
    },
  ];

  it.each(cases)(
    "$tool rejects $input without executing",
    async ({ create, input }) => {
      const logger = { tool: vi.fn() };
      const result = await invokeTool<string>(
        create({ logger: logger as never }),
        input
      );

      expect(result).toContain("InvalidToolInputError");
      expect(logger.tool).not.toHaveBeenCalled();
    }
  );
});
