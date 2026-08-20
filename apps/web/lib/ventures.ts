import { cache } from "react";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { Venture } from "@ai-catalyst/shared";
import {
  getVenture as getVentureUncached,
  listVentures as listVenturesUncached,
} from "@ai-catalyst/services/venture";

// Thin Next.js shell over packages/services/venture — read paths only;
// create/archive are mutations and go through the API route handlers.
export const listVentures = cache(listVenturesUncached);
export const getVenture = cache(getVentureUncached);

/** Resolves the Venture for an already-loaded active context, or null. */
export function ventureForActiveContext(
  actor: ActorContext,
  activeContext: { ventureId: string | null },
): Promise<Venture | null> {
  return activeContext.ventureId
    ? getVenture(actor, activeContext.ventureId)
    : Promise.resolve(null);
}
