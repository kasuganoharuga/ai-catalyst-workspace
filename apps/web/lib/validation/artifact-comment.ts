import { z } from "zod";

import { firstZodMessage } from "./common";

export { firstZodMessage };

/** Matches the artifact-comment service's own bounds (trim + non-empty + ≤4000). */
export const commentBodySchema = z
  .string()
  .trim()
  .min(1, "Write something before posting.")
  .max(4000, "Comments must be at most 4000 characters.");

export const commentAnchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("document") }),
  z.object({
    kind: z.literal("section"),
    heading: z.string().trim().min(1),
    headingLevel: z.number().int().min(1).max(6),
    quote: z.string().max(500).nullable().optional(),
  }),
]);

export const createArtifactCommentThreadInputSchema = z.object({
  attemptId: z.string(),
  artifactKey: z.string().min(1),
  anchor: commentAnchorSchema,
  body: commentBodySchema,
  pathname: z.string().min(1),
});

export const replyToArtifactCommentThreadInputSchema = z.object({
  threadId: z.string(),
  body: commentBodySchema,
  pathname: z.string().min(1),
});

export const editArtifactCommentInputSchema = z.object({
  commentId: z.string(),
  body: commentBodySchema,
  pathname: z.string().min(1),
});

export const threadActionInputSchema = z.object({
  threadId: z.string(),
  pathname: z.string().min(1),
});

export const commentActionInputSchema = z.object({
  commentId: z.string(),
  pathname: z.string().min(1),
});
