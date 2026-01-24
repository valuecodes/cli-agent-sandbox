import type { Logger } from "~clients/logger";
import type { z } from "zod";
import { argv } from "zx";

export type ParseArgsOptions<T extends z.ZodType> = {
  logger: Logger;
  schema: T;
};

/**
 * Parses and validates CLI arguments using a Zod schema.
 * @param options - Logger and Zod schema for validation
 * @returns Validated arguments matching the schema type
 * @throws If arguments fail schema validation
 */
export const parseArgs = <T extends z.ZodType>({
  logger,
  schema,
}: ParseArgsOptions<T>): z.infer<T> => {
  logger.debug("Parsing CLI arguments...");
  const args = schema.parse(argv);
  logger.debug(`Parsed args: ${JSON.stringify(args)}`);
  return args;
};
