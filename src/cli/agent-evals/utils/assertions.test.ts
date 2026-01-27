import { describe, expect, it } from "vitest";

import type { Assertion } from "../schemas";
import { evaluateAssertion } from "./assertions";

describe("evaluateAssertion", () => {
  describe("contains", () => {
    it("passes when output contains the value", () => {
      const assertion: Assertion = {
        type: "contains",
        value: "hello",
      };
      const result = evaluateAssertion(assertion, { message: "hello world" });
      expect(result.passed).toBe(true);
      expect(result.message).toContain("contains");
    });

    it("fails when output does not contain the value", () => {
      const assertion: Assertion = {
        type: "contains",
        value: "goodbye",
      };
      const result = evaluateAssertion(assertion, { message: "hello world" });
      expect(result.passed).toBe(false);
      expect(result.message).toContain("does not contain");
    });

    it("is case sensitive by default", () => {
      const assertion: Assertion = {
        type: "contains",
        value: "HELLO",
      };
      const result = evaluateAssertion(assertion, "hello world");
      expect(result.passed).toBe(false);
    });

    it("respects caseSensitive: false", () => {
      const assertion: Assertion = {
        type: "contains",
        value: "HELLO",
        caseSensitive: false,
      };
      const result = evaluateAssertion(assertion, "hello world");
      expect(result.passed).toBe(true);
    });

    it("works with string output", () => {
      const assertion: Assertion = {
        type: "contains",
        value: "test",
      };
      const result = evaluateAssertion(assertion, "this is a test string");
      expect(result.passed).toBe(true);
    });
  });

  describe("matchesRegex", () => {
    it("passes when output matches pattern", () => {
      const assertion: Assertion = {
        type: "matchesRegex",
        pattern: "\\d{3}-\\d{4}",
      };
      const result = evaluateAssertion(assertion, "Call 555-1234");
      expect(result.passed).toBe(true);
    });

    it("fails when output does not match pattern", () => {
      const assertion: Assertion = {
        type: "matchesRegex",
        pattern: "\\d{3}-\\d{4}",
      };
      const result = evaluateAssertion(assertion, "No number here");
      expect(result.passed).toBe(false);
    });

    it("supports regex flags", () => {
      const assertion: Assertion = {
        type: "matchesRegex",
        pattern: "hello",
        flags: "i",
      };
      const result = evaluateAssertion(assertion, "HELLO WORLD");
      expect(result.passed).toBe(true);
    });

    it("handles invalid regex gracefully", () => {
      const assertion: Assertion = {
        type: "matchesRegex",
        pattern: "[invalid",
      };
      const result = evaluateAssertion(assertion, "test");
      expect(result.passed).toBe(false);
      expect(result.message).toContain("Invalid regex");
    });
  });

  describe("equals", () => {
    it("passes for equal primitive values", () => {
      const assertion: Assertion = {
        type: "equals",
        expected: 42,
      };
      const result = evaluateAssertion(assertion, 42);
      expect(result.passed).toBe(true);
    });

    it("fails for different primitive values", () => {
      const assertion: Assertion = {
        type: "equals",
        expected: 42,
      };
      const result = evaluateAssertion(assertion, 43);
      expect(result.passed).toBe(false);
    });

    it("passes for equal objects", () => {
      const assertion: Assertion = {
        type: "equals",
        expected: { a: 1, b: 2 },
      };
      const result = evaluateAssertion(assertion, { a: 1, b: 2 });
      expect(result.passed).toBe(true);
    });

    it("fails for different objects", () => {
      const assertion: Assertion = {
        type: "equals",
        expected: { a: 1, b: 2 },
      };
      const result = evaluateAssertion(assertion, { a: 1, b: 3 });
      expect(result.passed).toBe(false);
    });

    it("passes for equal strings", () => {
      const assertion: Assertion = {
        type: "equals",
        expected: "hello",
      };
      const result = evaluateAssertion(assertion, "hello");
      expect(result.passed).toBe(true);
    });
  });

  describe("jsonPath", () => {
    it("extracts and compares nested values", () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "response.status",
        expected: "success",
      };
      const result = evaluateAssertion(assertion, {
        response: { status: "success" },
      });
      expect(result.passed).toBe(true);
    });

    it("supports $. prefix in path", () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "$.response.status",
        expected: "success",
      };
      const result = evaluateAssertion(assertion, {
        response: { status: "success" },
      });
      expect(result.passed).toBe(true);
    });

    it("fails when path value does not match", () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "response.status",
        expected: "success",
      };
      const result = evaluateAssertion(assertion, {
        response: { status: "error" },
      });
      expect(result.passed).toBe(false);
    });

    it("fails for missing path", () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "missing.path",
        expected: "value",
      };
      const result = evaluateAssertion(assertion, { other: "data" });
      expect(result.passed).toBe(false);
      expect(result.message).toContain("Failed to evaluate path");
    });

    it("handles deeply nested paths", () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "a.b.c.d",
        expected: 123,
      };
      const result = evaluateAssertion(assertion, {
        a: { b: { c: { d: 123 } } },
      });
      expect(result.passed).toBe(true);
    });

    it("compares arrays correctly", () => {
      const assertion: Assertion = {
        type: "jsonPath",
        path: "items",
        expected: [1, 2, 3],
      };
      const result = evaluateAssertion(assertion, { items: [1, 2, 3] });
      expect(result.passed).toBe(true);
    });
  });
});
