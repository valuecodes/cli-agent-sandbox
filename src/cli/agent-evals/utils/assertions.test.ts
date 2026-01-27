import fs from "node:fs/promises";
import path from "node:path";
import { TMP_ROOT } from "~tools/utils/fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Assertion } from "../schemas";
import { evaluateAssertion } from "./assertions";

describe("evaluateAssertion", () => {
  describe("contains", () => {
    it("passes when output contains the value", async () => {
      const assertion: Assertion = {
        type: "contains",
        value: "hello",
      };
      const result = await evaluateAssertion(assertion, {
        message: "hello world",
      });
      expect(result.passed).toBe(true);
      expect(result.message).toContain("contains");
    });

    it("fails when output does not contain the value", async () => {
      const assertion: Assertion = {
        type: "contains",
        value: "goodbye",
      };
      const result = await evaluateAssertion(assertion, {
        message: "hello world",
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain("does not contain");
    });

    it("is case sensitive by default", async () => {
      const assertion: Assertion = {
        type: "contains",
        value: "HELLO",
      };
      const result = await evaluateAssertion(assertion, "hello world");
      expect(result.passed).toBe(false);
    });

    it("respects caseSensitive: false", async () => {
      const assertion: Assertion = {
        type: "contains",
        value: "HELLO",
        caseSensitive: false,
      };
      const result = await evaluateAssertion(assertion, "hello world");
      expect(result.passed).toBe(true);
    });

    it("works with string output", async () => {
      const assertion: Assertion = {
        type: "contains",
        value: "test",
      };
      const result = await evaluateAssertion(
        assertion,
        "this is a test string"
      );
      expect(result.passed).toBe(true);
    });
  });

  describe("matchesRegex", () => {
    it("passes when output matches pattern", async () => {
      const assertion: Assertion = {
        type: "matchesRegex",
        pattern: "\\d{3}-\\d{4}",
      };
      const result = await evaluateAssertion(assertion, "Call 555-1234");
      expect(result.passed).toBe(true);
    });

    it("fails when output does not match pattern", async () => {
      const assertion: Assertion = {
        type: "matchesRegex",
        pattern: "\\d{3}-\\d{4}",
      };
      const result = await evaluateAssertion(assertion, "No number here");
      expect(result.passed).toBe(false);
    });

    it("supports regex flags", async () => {
      const assertion: Assertion = {
        type: "matchesRegex",
        pattern: "hello",
        flags: "i",
      };
      const result = await evaluateAssertion(assertion, "HELLO WORLD");
      expect(result.passed).toBe(true);
    });

    it("handles invalid regex gracefully", async () => {
      const assertion: Assertion = {
        type: "matchesRegex",
        pattern: "[invalid",
      };
      const result = await evaluateAssertion(assertion, "test");
      expect(result.passed).toBe(false);
      expect(result.message).toContain("Invalid regex");
    });
  });

  describe("equals", () => {
    it("passes for equal primitive values", async () => {
      const assertion: Assertion = {
        type: "equals",
        expected: 42,
      };
      const result = await evaluateAssertion(assertion, 42);
      expect(result.passed).toBe(true);
    });

    it("fails for different primitive values", async () => {
      const assertion: Assertion = {
        type: "equals",
        expected: 42,
      };
      const result = await evaluateAssertion(assertion, 43);
      expect(result.passed).toBe(false);
    });

    it("passes for equal objects", async () => {
      const assertion: Assertion = {
        type: "equals",
        expected: { a: 1, b: 2 },
      };
      const result = await evaluateAssertion(assertion, { a: 1, b: 2 });
      expect(result.passed).toBe(true);
    });

    it("fails for different objects", async () => {
      const assertion: Assertion = {
        type: "equals",
        expected: { a: 1, b: 2 },
      };
      const result = await evaluateAssertion(assertion, { a: 1, b: 3 });
      expect(result.passed).toBe(false);
    });

    it("passes for equal strings", async () => {
      const assertion: Assertion = {
        type: "equals",
        expected: "hello",
      };
      const result = await evaluateAssertion(assertion, "hello");
      expect(result.passed).toBe(true);
    });
  });

  describe("jsonPath", () => {
    it("extracts and compares nested values", async () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "response.status",
        expected: "success",
      };
      const result = await evaluateAssertion(assertion, {
        response: { status: "success" },
      });
      expect(result.passed).toBe(true);
    });

    it("supports $. prefix in path", async () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "$.response.status",
        expected: "success",
      };
      const result = await evaluateAssertion(assertion, {
        response: { status: "success" },
      });
      expect(result.passed).toBe(true);
    });

    it("fails when path value does not match", async () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "response.status",
        expected: "success",
      };
      const result = await evaluateAssertion(assertion, {
        response: { status: "error" },
      });
      expect(result.passed).toBe(false);
    });

    it("fails for missing path", async () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "missing.path",
        expected: "value",
      };
      const result = await evaluateAssertion(assertion, { other: "data" });
      expect(result.passed).toBe(false);
      expect(result.message).toContain("Failed to evaluate path");
    });

    it("handles deeply nested paths", async () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "a.b.c.d",
        expected: 123,
      };
      const result = await evaluateAssertion(assertion, {
        a: { b: { c: { d: 123 } } },
      });
      expect(result.passed).toBe(true);
    });

    it("compares arrays correctly", async () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "items",
        expected: [1, 2, 3],
      };
      const result = await evaluateAssertion(assertion, { items: [1, 2, 3] });
      expect(result.passed).toBe(true);
    });
  });

  describe("file assertions", () => {
    const TEST_DIR = path.join(TMP_ROOT, "assertion-tests");
    const TEST_FILE = path.join(TEST_DIR, "test-file.txt");
    const TEST_JSON_FILE = path.join(TEST_DIR, "test-data.json");

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
  });
});
