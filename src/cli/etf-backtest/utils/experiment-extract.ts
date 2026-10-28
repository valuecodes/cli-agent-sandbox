import { INDEX_NOT_FOUND, JSON_SLICE_END_OFFSET, ZERO } from "../constants";
import { ExperimentResultSchema } from "../types/schemas";
import type { ExperimentResult } from "../types/schemas";

const extractJsonFromStdout = (stdout: string): unknown => {
  const startIdx = stdout.indexOf("{");
  if (startIdx === INDEX_NOT_FOUND) {
    return null;
  }

  let braceCount = ZERO;
  let endIdx = INDEX_NOT_FOUND;
  for (let i = startIdx; i < stdout.length; i++) {
    if (stdout[i] === "{") {
      braceCount++;
    }
    if (stdout[i] === "}") {
      braceCount--;
    }
    if (braceCount === ZERO) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === INDEX_NOT_FOUND) {
    return null;
  }

  const jsonStr = stdout.slice(startIdx, endIdx + JSON_SLICE_END_OFFSET);
  return JSON.parse(jsonStr);
};

export const extractLastExperimentResult = (runResult: {
  newItems?: { type: string; output?: unknown }[];
}): ExperimentResult | null => {
  try {
    const items = runResult.newItems ?? [];
    for (const item of items) {
      // Mirrors the old truthiness check: other falsy values (0, false, NaN)
      // fall through harmlessly because they have no `stdout`.
      if (
        item.type === "tool_call_output_item" &&
        item.output !== undefined &&
        item.output !== null &&
        item.output !== ""
      ) {
        const output = item.output;
        let parsed: unknown;
        if (typeof output === "string") {
          parsed = JSON.parse(output);
        } else {
          parsed = output;
        }

        const toolResult = parsed as { stdout?: string };
        if (toolResult.stdout !== undefined && toolResult.stdout !== "") {
          const result = extractJsonFromStdout(toolResult.stdout);
          // Parsing a "{...}" slice yields an object or throws, so null is the only falsy outcome.
          if (result !== null) {
            const validated = ExperimentResultSchema.safeParse(result);
            if (validated.success) {
              return validated.data;
            }
          }
        }
      }
    }
  } catch {
    // Parsing failed, return null
  }
  return null;
};
