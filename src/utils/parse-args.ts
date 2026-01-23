import { argv } from "zx";
import type { z } from "zod";
import type { Logger } from "../clients/logger";

export type ParseArgsOptions<T extends z.ZodType> = {
  logger: Logger;
  schema: T;
};

export const parseArgs = <T extends z.ZodType>({
  logger,
  schema,
}: ParseArgsOptions<T>): z.infer<T> => {
  logger.debug("Parsing CLI arguments...");
  const args = schema.parse(argv);
  logger.debug(`Parsed args: ${JSON.stringify(args)}`);
  return args;
};
