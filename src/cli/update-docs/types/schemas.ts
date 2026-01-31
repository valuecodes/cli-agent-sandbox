import { z } from "zod";

export const CliArgsSchema = z.object({
  base: z.string().default("main"),
  codex: z.coerce.boolean().default(true),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;
