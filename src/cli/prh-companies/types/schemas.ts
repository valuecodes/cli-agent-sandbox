import { z } from "zod";

export const CliArgsSchema = z.object({
  verbose: z.coerce.boolean().default(false),
});
