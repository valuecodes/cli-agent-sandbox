import fs from "node:fs/promises";
import path from "node:path";
import { TMP_ROOT } from "~tools/utils/fs";
import { invokeTool, tryCreateSymlink } from "~tools/utils/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDeleteFileTool } from "./delete-file-tool";

describe("createDeleteFileTool tmp path safety", () => {
  let testDir = "";
  let relativeDir = "";
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const mockLogger = { tool: () => {} } as never;

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

  it("deletes relative paths under tmp", async () => {
    const relativePath = path.join(relativeDir, "to-delete.txt");
    const absolutePath = path.join(TMP_ROOT, relativePath);
    await fs.writeFile(absolutePath, "delete me", "utf8");

    const deleteFileTool = createDeleteFileTool({ logger: mockLogger });
    const result = await invokeTool<string>(deleteFileTool, {
      path: relativePath,
    });

    expect(result).toContain("Deleted");
    await expect(fs.access(absolutePath)).rejects.toThrow();
  });

  it("deletes absolute paths under tmp", async () => {
    const absolutePath = path.join(testDir, "absolute-delete.txt");
    await fs.writeFile(absolutePath, "delete me", "utf8");

    const deleteFileTool = createDeleteFileTool({ logger: mockLogger });
    const result = await invokeTool<string>(deleteFileTool, {
      path: absolutePath,
    });

    expect(result).toContain("Deleted");
    await expect(fs.access(absolutePath)).rejects.toThrow();
  });

  it("rejects path traversal attempts", async () => {
    const deleteFileTool = createDeleteFileTool({ logger: mockLogger });
    const result = await invokeTool<string>(deleteFileTool, {
      path: "../outside.txt",
    });
    expect(result).toContain("Path traversal is not allowed.");
  });

  it("rejects symlink paths", async () => {
    const realDir = path.join(testDir, "real");
    await fs.mkdir(realDir, { recursive: true });
    const realFile = path.join(realDir, "file.txt");
    await fs.writeFile(realFile, "real content", "utf8");
    const linkDir = path.join(testDir, "link");

    const symlinkCreated = await tryCreateSymlink(realDir, linkDir);
    if (!symlinkCreated) {
      return;
    }

    const symlinkPath = path.join(relativeDir, "link", "file.txt");

    const deleteFileTool = createDeleteFileTool({ logger: mockLogger });
    const result = await invokeTool<string>(deleteFileTool, {
      path: symlinkPath,
    });
    expect(result).toContain("Symlink paths are not allowed.");
  });

  it("returns error for non-existent files", async () => {
    const deleteFileTool = createDeleteFileTool({ logger: mockLogger });
    const result = await invokeTool<string>(deleteFileTool, {
      path: path.join(relativeDir, "nonexistent.txt"),
    });
    expect(result).toContain("Path does not exist.");
  });
});
