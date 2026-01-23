import { question } from "zx";
import { z } from "zod";
import type { Logger } from "../clients/logger";

export type QuestionHandlerConfig = {
  logger: Logger;
};

export type AskOptions<T extends z.ZodType = z.ZodString> = {
  /** The prompt to display to the user */
  prompt: string;

  /** Optional Zod schema for validation (defaults to non-empty trimmed string) */
  schema?: T;

  /** Optional default value if user provides empty input */
  defaultValue?: z.infer<T>;

  /** Whether empty input is allowed (ignored if schema is provided) */
  allowEmpty?: boolean;

  /** Optional custom error message for validation failures */
  errorMessage?: string;

  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
};

export type AskResult<T> = {
  /** The validated and processed answer */
  answer: T;

  /** Raw input before trimming/validation */
  rawInput: string;
};

const NonEmptyString = z.string().trim().min(1, "Input cannot be empty");

export class QuestionHandler {
  private logger: Logger;

  constructor(config: QuestionHandlerConfig) {
    this.logger = config.logger;
  }

  async ask<T extends z.ZodType = z.ZodString>(
    options: AskOptions<T>
  ): Promise<AskResult<z.infer<T>>> {
    const {
      prompt,
      schema,
      defaultValue,
      allowEmpty = false,
      errorMessage,
      maxRetries = 3,
    } = options;

    const effectiveSchema: z.ZodType =
      schema ?? (allowEmpty ? z.string().trim() : NonEmptyString);

    let attempts = 0;

    while (attempts < maxRetries) {
      attempts++;

      this.logger.question(prompt.trim());
      const rawInput = await question("");
      const trimmedInput = rawInput.trim();

      if (trimmedInput === "" && defaultValue !== undefined) {
        return {
          answer: defaultValue,
          rawInput,
        };
      }

      const result = effectiveSchema.safeParse(trimmedInput);

      if (result.success) {
        return {
          answer: result.data as z.infer<T>,
          rawInput,
        };
      }

      const validationMessage =
        errorMessage ?? result.error.issues[0]?.message ?? "Invalid input";

      this.logger.question(`Validation failed: ${validationMessage}`);

      if (attempts < maxRetries) {
        this.logger.question(
          `Please try again (${maxRetries - attempts} attempts remaining)`
        );
      }
    }

    const error = new Error(
      `Maximum retries (${maxRetries}) exceeded for prompt: "${prompt}"`
    );
    this.logger.question(error.message);
    throw error;
  }

  async askString(options: {
    prompt: string;
    defaultValue?: string;
    allowEmpty?: boolean;
  }): Promise<string> {
    const result = await this.ask({
      prompt: options.prompt,
      schema: z.string().trim(),
      defaultValue: options.defaultValue,
      allowEmpty: options.allowEmpty ?? options.defaultValue !== undefined,
    });
    return result.answer;
  }
}
