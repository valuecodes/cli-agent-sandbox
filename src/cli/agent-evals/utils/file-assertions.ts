import fs from "node:fs/promises";
import {
  resolveTmpPathForAccess,
  resolveTmpPathForRead,
} from "~tools/utils/fs";

import type {
  AssertionResult,
  FileContainsAssertion,
  FileExistsAssertion,
  FileJsonPathAssertion,
  FileNotExistsAssertion,
} from "../types/schemas";

/**
 * Evaluate a fileExists assertion by checking if the file exists in tmp/.
 */
export const evaluateFileExistsAssertion = async (
  assertion: FileExistsAssertion
): Promise<AssertionResult> => {
  try {
    const fullPath = await resolveTmpPathForAccess(assertion.path);
    await fs.access(fullPath);
    return {
      assertion,
      passed: true,
      message: `File exists: ${assertion.path}`,
      actual: assertion.path,
      expected: "file to exist",
    };
  } catch (err) {
    return {
      assertion,
      passed: false,
      message: `File does not exist: ${assertion.path}`,
      actual: err instanceof Error ? err.message : String(err),
      expected: "file to exist",
    };
  }
};

/**
 * Evaluate a fileContains assertion by reading the file and checking for a substring.
 */
export const evaluateFileContainsAssertion = async (
  assertion: FileContainsAssertion
): Promise<AssertionResult> => {
  try {
    const fullPath = await resolveTmpPathForRead(assertion.path);
    const content = await fs.readFile(fullPath, "utf8");
    const caseSensitive = assertion.caseSensitive ?? true;
    const searchValue = caseSensitive
      ? assertion.value
      : assertion.value.toLowerCase();
    const searchIn = caseSensitive ? content : content.toLowerCase();
    const passed = searchIn.includes(searchValue);

    return {
      assertion,
      passed,
      message: passed
        ? `File contains "${assertion.value}"`
        : `File does not contain "${assertion.value}"`,
      actual: content.length > 500 ? `${content.slice(0, 500)}...` : content,
      expected: assertion.value,
    };
  } catch (err) {
    return {
      assertion,
      passed: false,
      message: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      actual: "file read error",
      expected: assertion.value,
    };
  }
};

/**
 * Evaluate a fileJsonPath assertion by reading a JSON file and checking a path.
 */
export const evaluateFileJsonPathAssertion = async (
  assertion: FileJsonPathAssertion
): Promise<AssertionResult> => {
  try {
    const fullPath = await resolveTmpPathForRead(assertion.path);
    const content = await fs.readFile(fullPath, "utf8");
    const json = JSON.parse(content) as unknown;
    const value = getJsonPath(json, assertion.jsonPath);
    const passed = deepEquals(value, assertion.expected);

    return {
      assertion,
      passed,
      message: passed
        ? `Value at ${assertion.jsonPath} equals expected`
        : `Value at ${assertion.jsonPath} does not equal expected`,
      actual: value,
      expected: assertion.expected,
    };
  } catch (err) {
    return {
      assertion,
      passed: false,
      message: `Failed to evaluate: ${err instanceof Error ? err.message : String(err)}`,
      actual: "evaluation error",
      expected: assertion.expected,
    };
  }
};

/**
 * Evaluate a fileNotExists assertion by checking if the file does not exist in tmp/.
 */
export const evaluateFileNotExistsAssertion = async (
  assertion: FileNotExistsAssertion
): Promise<AssertionResult> => {
  try {
    const fullPath = await resolveTmpPathForAccess(assertion.path);
    await fs.access(fullPath);
    return {
      assertion,
      passed: false,
      message: `File still exists: ${assertion.path}`,
      actual: "file exists",
      expected: "file to not exist",
    };
  } catch (err) {
    if (isErrno(err, "ENOENT")) {
      return {
        assertion,
        passed: true,
        message: `File does not exist: ${assertion.path}`,
        actual: "file not found",
        expected: "file to not exist",
      };
    }
    return {
      assertion,
      passed: false,
      message: `Failed to check file: ${err instanceof Error ? err.message : String(err)}`,
      actual: err instanceof Error ? err.message : String(err),
      expected: "file to not exist",
    };
  }
};

const isErrno = (
  error: unknown,
  code: string
): error is NodeJS.ErrnoException =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as NodeJS.ErrnoException).code === code;

/**
 * Deep equality check using JSON serialization.
 */
const deepEquals = (a: unknown, b: unknown): boolean => {
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * Simple JSON path getter supporting dot notation.
 * Supports paths like "name" or "$.response.status"
 */
const getJsonPath = (obj: unknown, pathStr: string): unknown => {
  const normalizedPath = pathStr.startsWith("$.") ? pathStr.slice(2) : pathStr;
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
