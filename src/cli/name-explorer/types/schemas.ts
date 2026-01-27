import { z } from "zod";

export const CliArgsSchema = z.object({
  refetch: z.coerce.boolean().default(false),
  mode: z.enum(["stats", "ai"]).default("ai"),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;
