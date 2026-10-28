import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TMP_ROOT } from "~tools/utils/fs";

import type { Assertion } from "../types/schemas";
import { evaluateAssertion } from "./assertions";

describe("evaluateAssertion", () => {
  describe("file assertions", () => {
    const TEST_DIR = path.join(TMP_ROOT, "assertion-tests");
    const TEST_FILE = path.join(TEST_DIR, "test-file.txt");
    const TEST_JSON_FILE = path.join(TEST_DIR, "test-data.json");
    const TRAVERSAL_PATH = "../package.json";

    beforeAll(async () => {
      await fs.mkdir(TEST_DIR, { recursive: true });
      await fs.writeFile(TEST_FILE, "Hello World\nThis is test content.");
      await fs.writeFile(
        TEST_JSON_FILE,
        JSON.stringify({ name: "test", value: 42, nested: { key: "value" } })
      );
    });

    afterAll(async () => {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    describe("fileExists", () => {
      it("passes when file exists", async () => {
        const assertion: Assertion = {
          type: "fileExists",
          path: "assertion-tests/test-file.txt",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(true);
        expect(result.message).toContain("exists");
      });

      it("fails when file does not exist", async () => {
        const assertion: Assertion = {
          type: "fileExists",
          path: "assertion-tests/nonexistent.txt",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
        expect(result.message).toContain("does not exist");
      });

      it("rejects traversal paths", async () => {
        const assertion: Assertion = {
          type: "fileExists",
          path: TRAVERSAL_PATH,
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
        expect(result.actual).toContain("Path traversal is not allowed");
      });
    });

    describe("fileContains", () => {
      it("passes when file contains the value", async () => {
        const assertion: Assertion = {
          type: "fileContains",
          path: "assertion-tests/test-file.txt",
          value: "Hello World",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(true);
        expect(result.message).toContain("contains");
      });

      it("fails when file does not contain the value", async () => {
        const assertion: Assertion = {
          type: "fileContains",
          path: "assertion-tests/test-file.txt",
          value: "Goodbye",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
        expect(result.message).toContain("does not contain");
      });

      it("is case sensitive by default", async () => {
        const assertion: Assertion = {
          type: "fileContains",
          path: "assertion-tests/test-file.txt",
          value: "HELLO WORLD",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
      });

      it("respects caseSensitive: false", async () => {
        const assertion: Assertion = {
          type: "fileContains",
          path: "assertion-tests/test-file.txt",
          value: "HELLO WORLD",
          caseSensitive: false,
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(true);
      });

      it("fails gracefully when file does not exist", async () => {
        const assertion: Assertion = {
          type: "fileContains",
          path: "assertion-tests/nonexistent.txt",
          value: "test",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
        expect(result.message).toContain("Failed to read file");
      });
    });

    describe("fileJsonPath", () => {
      it("extracts and compares JSON values", async () => {
        const assertion: Assertion = {
          type: "fileJsonPath",
          path: "assertion-tests/test-data.json",
          jsonPath: "name",
          expected: "test",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(true);
      });

      it("supports $. prefix in jsonPath", async () => {
        const assertion: Assertion = {
          type: "fileJsonPath",
          path: "assertion-tests/test-data.json",
          jsonPath: "$.value",
          expected: 42,
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(true);
      });

      it("handles nested paths", async () => {
        const assertion: Assertion = {
          type: "fileJsonPath",
          path: "assertion-tests/test-data.json",
          jsonPath: "nested.key",
          expected: "value",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(true);
      });

      it("fails when value does not match", async () => {
        const assertion: Assertion = {
          type: "fileJsonPath",
          path: "assertion-tests/test-data.json",
          jsonPath: "value",
          expected: 100,
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
      });

      it("fails gracefully for missing path", async () => {
        const assertion: Assertion = {
          type: "fileJsonPath",
          path: "assertion-tests/test-data.json",
          jsonPath: "missing.path",
          expected: "value",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
        expect(result.message).toContain("Failed to evaluate");
      });

      it("fails gracefully when file does not exist", async () => {
        const assertion: Assertion = {
          type: "fileJsonPath",
          path: "assertion-tests/nonexistent.json",
          jsonPath: "key",
          expected: "value",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
        expect(result.message).toContain("Failed to evaluate");
      });
    });

    describe("fileNotExists", () => {
      it("passes when file does not exist", async () => {
        const assertion: Assertion = {
          type: "fileNotExists",
          path: "assertion-tests/missing.txt",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(true);
        expect(result.message).toContain("does not exist");
      });

      it("fails when file exists", async () => {
        const assertion: Assertion = {
          type: "fileNotExists",
          path: "assertion-tests/test-file.txt",
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
        expect(result.message).toContain("still exists");
      });

      it("rejects traversal paths", async () => {
        const assertion: Assertion = {
          type: "fileNotExists",
          path: TRAVERSAL_PATH,
        };
        const result = await evaluateAssertion(assertion, null);
        expect(result.passed).toBe(false);
        expect(result.message).toContain("Failed to check file");
      });
    });
  });
});
