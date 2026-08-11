import { z } from "zod";

import { optionalNullableText } from "./common";

export const createVentureInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(200, "Name must be at most 200 characters."),
  oneLiner: optionalNullableText(300, "One-liner").optional(),
  summary: optionalNullableText(5000, "Summary").optional(),
});

export type CreateVentureInput = z.infer<typeof createVentureInputSchema>;
