import { cache } from "react";

import {
  getMentorArtefactDocument as getMentorArtefactDocumentUncached,
  getMentorFounderDetail as getMentorFounderDetailUncached,
  listMentorFounders as listMentorFoundersUncached,
} from "@ai-catalyst/services/mentor";

// Thin Next.js shell over packages/services/mentor, mirroring lib/invitations.ts:
// adds React's request-scoped cache() so a page and its metadata can each ask
// for the same Founder without a second round trip. No business logic here —
// authorization lives in the service, which re-checks the Mentor's claim on
// the Workspace on every one of these calls.
export const listMentorFounders = cache(listMentorFoundersUncached);
export const getMentorFounderDetail = cache(getMentorFounderDetailUncached);
export const getMentorArtefactDocument = cache(
  getMentorArtefactDocumentUncached,
);
