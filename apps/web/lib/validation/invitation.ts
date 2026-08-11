import { z } from "zod";

import { firstZodMessage } from "./common";

export { firstZodMessage };

/** Matches the service-layer create-invitation email bounds (trim + ≤320). */
export const invitationEmailSchema = z
  .string()
  .trim()
  .min(1, "Enter an email address.")
  .max(320, "Email must be at most 320 characters.")
  .pipe(z.email({ error: "Enter a valid email address." }));

export const createInvitationInputSchema = z.object({
  email: invitationEmailSchema,
  personalMessage: z
    .string()
    .max(2000, "Personal message must be at most 2000 characters.")
    .optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;
