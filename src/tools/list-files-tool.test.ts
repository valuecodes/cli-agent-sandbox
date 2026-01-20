import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { listFilesTool } from "./list-files-tool";
import { TMP_ROOT } from "./utils";
import { invokeTool, tryCreateSymlink } from "./test-utils";

describe("listFilesTool tmp path safety", () => {
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

  it("lists files with relative paths under tmp", async () => {
    await fs.writeFile(path.join(testDir, "file1.txt"), "content1", "utf8");
    await fs.writeFile(path.join(testDir, "file2.txt"), "content2", "utf8");
    await fs.mkdir(path.join(testDir, "subdir"), { recursive: true });

    const result = await invokeTool<string>(listFilesTool, {
      path: relativeDir,
    });

    expect(result).toContain("[file] file1.txt");
    expect(result).toContain("[file] file2.txt");
    expect(result).toContain("[dir]  subdir");
  });

  it("lists files with absolute paths under tmp", async () => {
    await fs.writeFile(path.join(testDir, "absolute.txt"), "content", "utf8");

    const result = await invokeTool<string>(listFilesTool, {
      path: testDir,
    });

    expect(result).toContain("[file] absolute.txt");
  });

  it("lists root of tmp when no path provided", async () => {
    const result = await invokeTool<string>(listFilesTool, {});

    expect(result).toContain("Contents of tmp:");
    expect(result).toContain(path.basename(testDir));
  });

  it("rejects path traversal attempts", async () => {
    const result = await invokeTool<string>(listFilesTool, {
      path: "../",
    });
    expect(result).toContain("Path traversal is not allowed.");
  });

  it("rejects symlink paths", async () => {
    const realDir = path.join(testDir, "real");
    await fs.mkdir(realDir, { recursive: true });
    const linkDir = path.join(testDir, "link");

    const symlinkCreated = await tryCreateSymlink(realDir, linkDir);
    if (!symlinkCreated) {
      return;
    }

    const symlinkPath = path.join(relativeDir, "link");

    const result = await invokeTool<string>(listFilesTool, {
      path: symlinkPath,
    });
    expect(result).toContain("Symlink paths are not allowed.");
  });

  it("returns empty message for empty directory", async () => {
    const emptyDir = path.join(testDir, "empty");
    await fs.mkdir(emptyDir, { recursive: true });

    const result = await invokeTool<string>(listFilesTool, {
      path: path.join(relativeDir, "empty"),
    });

    expect(result).toContain("is empty");
  });
});
