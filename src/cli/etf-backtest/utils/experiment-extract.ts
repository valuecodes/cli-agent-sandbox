import {
  INDEX_NOT_FOUND,
  JSON_SLICE_END_OFFSET,
  ZERO,
} from "../constants";
import { ExperimentResultSchema } from "../schemas";
import type { ExperimentResult } from "../schemas";

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
      if (item.type === "tool_call_output_item" && item.output) {
        const output = item.output;
        let parsed: unknown;
        if (typeof output === "string") {
          parsed = JSON.parse(output);
        } else {
          parsed = output;
        }

        const toolResult = parsed as { stdout?: string };
        if (toolResult.stdout) {
          const result = extractJsonFromStdout(toolResult.stdout);
          if (result) {
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
