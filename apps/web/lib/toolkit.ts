import { cache } from "react";

import {
  getSkillFile,
  getToolkitManifest as getToolkitManifestUncached,
  getToolkitModule as getToolkitModuleUncached,
  getToolkitModules as getToolkitModulesUncached,
} from "@ai-catalyst/services/module";

// Thin Next.js shell over packages/services/module: adds React's
// request-scoped cache() to the pure content reads (per-request
// deduplication only, not persistent caching) and otherwise delegates
// entirely — no business logic lives here.
//
// Backs /downloads (getSkillFile, getToolkitModule, getToolkitModules) —
// the public preview gallery that also read these (getModuleMarkdown, the
// /toolkit route) was retired.
export const getToolkitManifest = cache(getToolkitManifestUncached);
export const getToolkitModules = cache(getToolkitModulesUncached);
export const getToolkitModule = cache(getToolkitModuleUncached);

export { getSkillFile };
