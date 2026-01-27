import { z } from "zod";

export const OutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type Output = z.infer<typeof OutputSchema>;
