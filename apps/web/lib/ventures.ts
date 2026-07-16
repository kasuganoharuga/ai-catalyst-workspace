import { cache } from "react";

import {
  getVenture as getVentureUncached,
  listVentures as listVenturesUncached,
} from "@ai-catalyst/services/venture";

// Thin Next.js shell over packages/services/venture — read paths only;
// create/archive are mutations and go through the API route handlers.
export const listVentures = cache(listVenturesUncached);
export const getVenture = cache(getVentureUncached);
