import { cache } from "react";

import {
  getModuleCatalogEntry as getModuleCatalogEntryUncached,
  listModuleCatalog as listModuleCatalogUncached,
} from "@ai-catalyst/services/module/catalog";

// Thin Next.js shell over packages/services/module/catalog — read paths
// only, the same way lib/ventures.ts does.
export const listModuleCatalog = cache(listModuleCatalogUncached);
export const getModuleCatalogEntry = cache(getModuleCatalogEntryUncached);
