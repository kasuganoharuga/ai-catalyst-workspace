import { z } from "zod";

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

/** Empty / whitespace → null; otherwise trimmed string with a max length. */
export function optionalNullableText(max: number, label: string) {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    },
    z.union([
      z.null(),
      z.string().max(max, `${label} must be ${max} characters or fewer.`),
    ]),
  );
}

/** Optional http(s) URL; empty → null. */
export function optionalHttpUrl(label: string, max = 500) {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    },
    z.union([
      z.null(),
      z
        .string()
        .max(max, `${label} must be ${max} characters or fewer.`)
        .refine((value) => {
          try {
            const parsed = new URL(value);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
          } catch {
            return false;
          }
        }, `${label} must be a full URL, including https://.`),
    ]),
  );
}

/** Optional contact email; empty → null. */
export function optionalEmail(label = "Email", max = 320) {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    },
    z.union([
      z.null(),
      z
        .email({ error: `${label} must be a valid email address.` })
        .max(max, `${label} must be ${max} characters or fewer.`),
    ]),
  );
}
