import { z } from "zod";

export const CliArgsSchema = z.object({
  url: z.url(),
  refetch: z.coerce.boolean().default(false),
  filterUrl: z.string().optional(),
});

export type CliArgs = z.infer<typeof CliArgsSchema>;
