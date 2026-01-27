import type {
  Assertion,
  AssertionResult,
  ContainsAssertion,
  EqualsAssertion,
  JsonPathAssertion,
  MatchesRegexAssertion,
} from "../schemas";
import {
  evaluateFileContainsAssertion,
  evaluateFileExistsAssertion,
  evaluateFileJsonPathAssertion,
  evaluateFileNotExistsAssertion,
} from "./file-assertions";

/**
 * Evaluate a single assertion against the agent output.
 * File assertions are async (require filesystem access).
 */
export const evaluateAssertion = async (
  assertion: Assertion,
  output: unknown
): Promise<AssertionResult> => {
  switch (assertion.type) {
    case "contains":
      return evaluateContainsAssertion(assertion, output);
    case "matchesRegex":
      return evaluateMatchesRegexAssertion(assertion, output);
    case "equals":
      return evaluateEqualsAssertion(assertion, output);
    case "jsonPath":
      return evaluateJsonPathAssertion(assertion, output);
    case "fileExists":
      return evaluateFileExistsAssertion(assertion);
    case "fileContains":
      return evaluateFileContainsAssertion(assertion);
    case "fileJsonPath":
      return evaluateFileJsonPathAssertion(assertion);
    case "fileNotExists":
      return evaluateFileNotExistsAssertion(assertion);
  }
};

const evaluateContainsAssertion = (
  assertion: ContainsAssertion,
  output: unknown
): AssertionResult => {
  const outputStr = stringifyOutput(output);
  const caseSensitive = assertion.caseSensitive ?? true;
  const searchValue = caseSensitive
    ? assertion.value
    : assertion.value.toLowerCase();
  const searchIn = caseSensitive ? outputStr : outputStr.toLowerCase();
  const passed = searchIn.includes(searchValue);

  return {
    assertion,
    passed,
    message: passed
      ? `Output contains "${assertion.value}"`
      : `Output does not contain "${assertion.value}"`,
    actual: outputStr,
    expected: assertion.value,
  };
};

const evaluateMatchesRegexAssertion = (
  assertion: MatchesRegexAssertion,
  output: unknown
): AssertionResult => {
  const outputStr = stringifyOutput(output);

  try {
    const regex = new RegExp(assertion.pattern, assertion.flags);
    const passed = regex.test(outputStr);

    return {
      assertion,
      passed,
      message: passed
        ? `Output matches pattern /${assertion.pattern}/${assertion.flags ?? ""}`
        : `Output does not match pattern /${assertion.pattern}/${assertion.flags ?? ""}`,
      actual: outputStr,
      expected: assertion.pattern,
    };
  } catch (err) {
    return {
      assertion,
      passed: false,
      message: `Invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`,
      actual: outputStr,
      expected: assertion.pattern,
    };
  }
};

const evaluateEqualsAssertion = (
  assertion: EqualsAssertion,
  output: unknown
): AssertionResult => {
  const passed = deepEquals(output, assertion.expected);

  return {
    assertion,
    passed,
    message: passed
      ? "Output equals expected value"
      : "Output does not equal expected value",
    actual: output,
    expected: assertion.expected,
  };
};

const evaluateJsonPathAssertion = (
  assertion: JsonPathAssertion,
  output: unknown
): AssertionResult => {
  try {
    const value = getJsonPath(output, assertion.path);
    const passed = deepEquals(value, assertion.expected);

    return {
      assertion,
      passed,
      message: passed
        ? `Value at ${assertion.path} equals expected`
        : `Value at ${assertion.path} does not equal expected`,
      actual: value,
      expected: assertion.expected,
    };
  } catch (err) {
    return {
      assertion,
      passed: false,
      message: `Failed to evaluate path ${assertion.path}: ${err instanceof Error ? err.message : String(err)}`,
      actual: output,
      expected: assertion.expected,
    };
  }
};

/**
 * Convert output to string for text-based assertions.
 */
const stringifyOutput = (output: unknown): string => {
  if (typeof output === "string") {
    return output;
  }
  return JSON.stringify(output, null, 2);
};

/**
 * Deep equality check using JSON serialization.
 */
const deepEquals = (a: unknown, b: unknown): boolean => {
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * Simple JSON path getter supporting dot notation.
 * Supports paths like "response.status" or "$.response.status"
 */
const getJsonPath = (obj: unknown, path: string): unknown => {
  const normalizedPath = path.startsWith("$.") ? path.slice(2) : path;
  const parts = normalizedPath.split(".");

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      throw new Error(`Cannot read property "${part}" of ${String(current)}`);
    }
    if (typeof current !== "object") {
      throw new Error(`Cannot read property "${part}" of non-object`);
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
};
