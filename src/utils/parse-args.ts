import { argv } from "zx";
import type { z } from "zod";
import type { Logger } from "../clients/logger";

export interface ParseArgsOptions<T extends z.ZodTypeAny> {
  logger: Logger;
  schema: T;
}

export function parseArgs<T extends z.ZodTypeAny>({
  logger,
  schema,
}: ParseArgsOptions<T>): z.infer<T> {
  logger.debug("Parsing CLI arguments...");
  const args = schema.parse(argv);
  logger.debug(`Parsed args: ${JSON.stringify(args)}`);
  return args;
}
