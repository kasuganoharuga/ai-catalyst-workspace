import { z } from "zod";

import { optionalHttpUrl, optionalNullableText } from "./common";

const foundedYearSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      return Number(trimmed);
    }
    return value;
  },
  z.union([
    z.null(),
    z
      .number()
      .int({ error: "Year founded must be a whole number." })
      .min(1800, "Year founded must be between 1800 and 2100.")
      .max(2100, "Year founded must be between 1800 and 2100."),
  ]),
);

const hqCountrySchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim().toUpperCase();
    return trimmed === "" ? null : trimmed;
  },
  z.union([
    z.null(),
    z
      .string()
      .length(2, "Country must be a two-letter code (for example, AU)."),
  ]),
);

export const updateCompanyProfileInputSchema = z.object({
  name: optionalNullableText(200, "Company name"),
  oneLiner: optionalNullableText(300, "One-liner"),
  description: optionalNullableText(5000, "Description"),
  websiteUrl: optionalHttpUrl("Website"),
  linkedinUrl: optionalHttpUrl("LinkedIn"),
  hqCountry: hqCountrySchema,
  hqState: optionalNullableText(120, "State or region"),
  hqCity: optionalNullableText(120, "City"),
  hqStreet: optionalNullableText(120, "Street address"),
  hqPostalCode: optionalNullableText(20, "Postcode"),
  foundedYear: foundedYearSchema,
});

export type UpdateCompanyProfileInput = z.infer<
  typeof updateCompanyProfileInputSchema
>;
