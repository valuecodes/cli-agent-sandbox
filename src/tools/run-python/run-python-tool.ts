import { spawn } from "node:child_process";
import path from "node:path";
import { tool } from "@openai/agents";
import type { Logger } from "~clients/logger";

/**
 * Result of a Python script execution
 */
export type PythonResult = {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
};

/**
 * Default configuration values
 */
const DEFAULTS = {
  timeoutMs: 30000,
  maxOutputBytes: 50 * 1024, // 50KB
  pythonBinary: "python3",
} as const;

/**
 * Maximum allowed values
 */
const MAX_VALUES = {
  timeoutMs: 120000,
} as const;

/**
 * Clamp a value between bounds
 */
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Validate that script name is safe (no path traversal)
 */
export const isValidScriptName = (scriptName: string): boolean => {
  // Must end with .py
  if (!scriptName.endsWith(".py")) {
    return false;
  }

  // No path separators allowed (no subdirectories)
  if (scriptName.includes("/") || scriptName.includes("\\")) {
    return false;
  }

  // No path traversal
  if (scriptName.includes("..")) {
    return false;
  }

  // Only allow alphanumeric, underscores, hyphens, and .py extension
  const validPattern = /^[a-zA-Z0-9_-]+\.py$/;
  return validPattern.test(scriptName);
};

/**
 * Execute a Python script from the specified scripts directory
 */
const executePython = async (params: {
  scriptsDir: string;
  scriptName: string;
  args?: string[];
  input?: Record<string, unknown>;
  timeoutMs?: number;
  pythonBinary?: string;
}): Promise<PythonResult> => {
  const {
    scriptsDir,
    scriptName,
    args = [],
    input,
    timeoutMs = DEFAULTS.timeoutMs,
    pythonBinary = DEFAULTS.pythonBinary,
  } = params;

  const startTime = Date.now();

  // Validate script name
  if (!isValidScriptName(scriptName)) {
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: Date.now() - startTime,
      error: `Invalid script name: "${scriptName}". Must be a .py file with no path separators.`,
    };
  }

  const scriptPath = path.join(scriptsDir, scriptName);
  const effectiveTimeout = clamp(timeoutMs, 1000, MAX_VALUES.timeoutMs);

  return new Promise((resolve) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, effectiveTimeout);

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;

    const proc = spawn(pythonBinary, [scriptPath, ...args], {
      signal: controller.signal,
      cwd: scriptsDir,
    });

    // Write JSON input to stdin if provided
    if (input !== undefined) {
      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    proc.stdout.on("data", (data: Buffer) => {
      if (stdout.length < DEFAULTS.maxOutputBytes) {
        stdout += data.toString();
        if (stdout.length > DEFAULTS.maxOutputBytes) {
          stdout = stdout.slice(0, DEFAULTS.maxOutputBytes);
          stdoutTruncated = true;
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      if (stderr.length < DEFAULTS.maxOutputBytes) {
        stderr += data.toString();
        if (stderr.length > DEFAULTS.maxOutputBytes) {
          stderr = stderr.slice(0, DEFAULTS.maxOutputBytes);
          stderrTruncated = true;
        }
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (stdoutTruncated) {
        stdout += "\n[OUTPUT TRUNCATED]";
      }
      if (stderrTruncated) {
        stderr += "\n[OUTPUT TRUNCATED]";
      }

      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr,
        durationMs,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (err.name === "AbortError") {
        resolve({
          success: false,
          exitCode: null,
          stdout,
          stderr,
          durationMs,
          error: `Script execution timed out after ${effectiveTimeout}ms`,
        });
      } else {
        resolve({
          success: false,
          exitCode: null,
          stdout,
          stderr,
          durationMs,
          error: err.message,
        });
      }
    });
  });
};

export type RunPythonToolOptions = {
  /** Absolute path to the directory containing Python scripts */
  scriptsDir: string;
  /** Logger for tool execution logging */
  logger: Logger;
  /** Python binary to use (defaults to "python3") */
  pythonBinary?: string;
};

/**
 * Creates a tool to execute Python scripts from a specified directory.
 * Scripts must be pre-defined .py files in the configured scriptsDir.
 */
export const createRunPythonTool = ({
  scriptsDir,
  logger,
  pythonBinary,
}: RunPythonToolOptions) =>
  tool({
    name: "runPython",
    description:
      "Executes a Python script from the configured scripts directory. " +
      "Only .py files in the scripts directory can be executed. " +
      "Optionally accepts JSON input to pass via stdin. " +
      "Returns stdout, stderr, exit code, and execution time.",
    parameters: {
      type: "object",
      properties: {
        scriptName: {
          type: "string",
          description:
            'Name of the Python script to run (e.g., "hello.py"). Must be a .py file in the scripts directory.',
        },
        input: {
          type: "string",
          description:
            'JSON string to pass to the script via stdin. Pass empty string "" if no input needed. The script should read from stdin using json.load(sys.stdin).',
        },
      },
      required: ["scriptName", "input"],
      additionalProperties: false,
    },
    execute: async (params: { scriptName: string; input: string }) => {
      logger.tool(`Running Python script: ${params.scriptName}`);

      // Parse the input string to object if provided (empty string means no input)
      let parsedInput: Record<string, unknown> | undefined;
      if (params.input && params.input.trim() !== "") {
        try {
          parsedInput = JSON.parse(params.input) as Record<string, unknown>;
        } catch {
          return JSON.stringify({
            success: false,
            exitCode: null,
            stdout: "",
            stderr: "",
            durationMs: 0,
            error: "Invalid JSON in input parameter",
          } satisfies PythonResult);
        }
      }

      const result = await executePython({
        scriptsDir,
        scriptName: params.scriptName,
        input: parsedInput,
        pythonBinary,
      });
      logger.tool(
        `Python result: success=${result.success}, exitCode=${String(result.exitCode)}, durationMs=${result.durationMs}${result.error ? `, error=${result.error}` : ""}`
      );
      return JSON.stringify(result, null, 2);
    },
  });
