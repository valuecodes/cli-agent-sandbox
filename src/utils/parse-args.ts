import type { Logger } from "~clients/logger";
import type { z } from "zod";
import { parseArgv } from "zx";

export type ParseArgsOptions<T extends z.ZodType> = {
  logger: Logger;
  schema: T;
  rawArgs?: string[];
};

const sanitizeArgs = (rawArgs: string[]): string[] =>
  rawArgs.filter((arg) => arg !== "--");

/**
 * Parses and validates CLI arguments using a Zod schema.
 * @param options - Logger and Zod schema for validation
 * @returns Validated arguments matching the schema type
 * @throws If arguments fail schema validation
 */
export const parseArgs = <T extends z.ZodType>({
  logger,
  schema,
  rawArgs,
}: ParseArgsOptions<T>): z.infer<T> => {
  logger.debug("Parsing CLI arguments...");
  const parsedArgs = parseArgv(sanitizeArgs(rawArgs ?? process.argv.slice(2)));
  const args = schema.parse(parsedArgs);
  logger.debug("Parsed args", { args });
  return args;
};
