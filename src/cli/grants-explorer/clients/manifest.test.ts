import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MANIFEST_FILE } from "../constants";
import { readManifest, writeManifest } from "./manifest";

describe("manifest", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "grants-manifest-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips a manifest through writeManifest + readManifest", async () => {
    const manifest = [
      { code: "S11", label: "Yritykset" },
      {
        code: "S15",
        label: "Kotitalouksia palvelevat voittoa tavoittelemattomat järjestöt",
      },
    ];
    await writeManifest(dir, manifest);
    expect(await readManifest(dir)).toEqual(manifest);
  });

  it("rejects an empty manifest (must contain at least one sector)", async () => {
    await expect(writeManifest(dir, [])).rejects.toThrow();
  });

  it("rejects a manifest with a malformed code", async () => {
    await expect(
      writeManifest(dir, [{ code: "X11", label: "Bad" }])
    ).rejects.toThrow();
  });

  it("readManifest throws on non-JSON contents", async () => {
    await writeFile(join(dir, MANIFEST_FILE), "not json{", "utf8");
    await expect(readManifest(dir)).rejects.toThrow();
  });

  it("readManifest throws on JSON that doesn't match the schema", async () => {
    await writeFile(
      join(dir, MANIFEST_FILE),
      JSON.stringify([{ code: "S15" /* missing label */ }]),
      "utf8"
    );
    await expect(readManifest(dir)).rejects.toThrow();
  });
});
