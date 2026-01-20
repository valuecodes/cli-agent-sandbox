import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import type { FunctionTool } from "@openai/agents";
import { writeFileTool } from "./write-file-tool";

const TMP_ROOT = path.resolve(process.cwd(), "tmp");
const RUN_CONTEXT = {} as unknown as Parameters<FunctionTool["invoke"]>[0];
const SYMLINK_ERROR_CODES = new Set(["EPERM", "EACCES", "ENOSYS", "EINVAL"]);

const isErrnoWithCode = (error: unknown, codes: Set<string>) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as NodeJS.ErrnoException).code === "string" &&
  codes.has((error as NodeJS.ErrnoException).code ?? "");

const invokeTool = async <TResult>(
  tool: FunctionTool,
  input: Record<string, unknown>
): Promise<TResult> =>
  tool.invoke(RUN_CONTEXT, JSON.stringify(input)) as Promise<TResult>;

const tryCreateSymlink = async (target: string, linkPath: string) => {
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

describe("writeFileTool tmp path safety", () => {
  let testDir = "";
  let relativeDir = "";

  beforeEach(async () => {
    await fs.mkdir(TMP_ROOT, { recursive: true });
    testDir = await fs.mkdtemp(path.join(TMP_ROOT, "vitest-tools-"));
    relativeDir = path.relative(TMP_ROOT, testDir);
  });

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
    testDir = "";
    relativeDir = "";
  });

  it("writes relative paths under tmp", async () => {
    const relativePath = path.join(relativeDir, "relative.txt");
    const content = "hello";

    const writeResult = await invokeTool<string>(writeFileTool, {
      path: relativePath,
      content,
    });
    expect(writeResult).toContain("Wrote");
    const fileContents = await fs.readFile(
      path.join(TMP_ROOT, relativePath),
      "utf8"
    );
    expect(fileContents).toBe(content);
  });

  it("writes absolute paths under tmp", async () => {
    const absolutePath = path.join(testDir, "absolute.txt");
    const content = "absolute";

    const writeResult = await invokeTool<string>(writeFileTool, {
      path: absolutePath,
      content,
    });
    expect(writeResult).toContain("Wrote");
    const fileContents = await fs.readFile(absolutePath, "utf8");
    expect(fileContents).toBe(content);
  });

  it("rejects path traversal attempts", async () => {
    const writeResult = await invokeTool<string>(writeFileTool, {
      path: "../outside.txt",
      content: "nope",
    });
    expect(writeResult).toContain("Path traversal is not allowed.");
  });

  it("rejects symlink paths", async () => {
    const realDir = path.join(testDir, "real");
    await fs.mkdir(realDir, { recursive: true });
    const linkDir = path.join(testDir, "link");

    const symlinkCreated = await tryCreateSymlink(realDir, linkDir);
    if (!symlinkCreated) {
      return;
    }

    const symlinkPath = path.join(relativeDir, "link", "file.txt");

    const writeResult = await invokeTool<string>(writeFileTool, {
      path: symlinkPath,
      content: "nope",
    });
    expect(writeResult).toContain("Symlink paths are not allowed.");
  });
});
