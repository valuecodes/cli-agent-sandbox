import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { readFileTool } from "./read-file-tool";
import { TMP_ROOT } from "./utils";
import { invokeTool, tryCreateSymlink } from "./test-utils";

describe("readFileTool tmp path safety", () => {
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

  it("reads relative paths under tmp", async () => {
    const relativePath = path.join(relativeDir, "relative.txt");
    const content = "hello";
    await fs.writeFile(path.join(TMP_ROOT, relativePath), content, "utf8");

    const readResult = await invokeTool<string>(readFileTool, {
      path: relativePath,
    });
    expect(readResult).toBe(content);
  });

  it("reads absolute paths under tmp", async () => {
    const absolutePath = path.join(testDir, "absolute.txt");
    const content = "absolute";
    await fs.writeFile(absolutePath, content, "utf8");

    const readResult = await invokeTool<string>(readFileTool, {
      path: absolutePath,
    });
    expect(readResult).toBe(content);
  });

  it("rejects path traversal attempts", async () => {
    const readResult = await invokeTool<string>(readFileTool, {
      path: "../outside.txt",
    });
    expect(readResult).toContain("Path traversal is not allowed.");
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

    const readResult = await invokeTool<string>(readFileTool, {
      path: symlinkPath,
    });
    expect(readResult).toContain("Symlink paths are not allowed.");
  });
});
