import fs from "node:fs/promises";
import type { FunctionTool } from "@openai/agents";

const RUN_CONTEXT = {} as unknown as Parameters<FunctionTool["invoke"]>[0];
const SYMLINK_ERROR_CODES = new Set(["EPERM", "EACCES", "ENOSYS", "EINVAL"]);

const isErrnoWithCode = (error: unknown, codes: Set<string>) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as NodeJS.ErrnoException).code === "string" &&
  codes.has((error as NodeJS.ErrnoException).code ?? "");

export const invokeTool = async <TResult>(
  tool: FunctionTool,
  input: Record<string, unknown>
): Promise<TResult> =>
  tool.invoke(RUN_CONTEXT, JSON.stringify(input)) as Promise<TResult>;

export const tryCreateSymlink = async (target: string, linkPath: string) => {
  try {
    await fs.symlink(target, linkPath, "dir");
    return true;
  } catch (error) {
    if (isErrnoWithCode(error, SYMLINK_ERROR_CODES)) {
      return false;
    }
    throw error;
  }
};
