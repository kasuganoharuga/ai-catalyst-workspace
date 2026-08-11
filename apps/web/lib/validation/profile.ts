import { z } from "zod";

import { optionalEmail, optionalHttpUrl, optionalNullableText } from "./common";

export const updateProfileInputSchema = z.object({
  firstName: optionalNullableText(120, "First name"),
  lastName: optionalNullableText(120, "Last name"),
  contactEmail: optionalEmail("Contact email"),
  jobTitle: optionalNullableText(160, "Job title"),
  linkedinUrl: optionalHttpUrl("LinkedIn"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
