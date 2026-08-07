import type { ToolkitSeedContent } from "../types.js";
import { MODULE_0_CONTENT } from "./module-0.js";
import { MODULE_1_CONTENT } from "./module-1.js";
import { MODULE_2_CONTENT } from "./module-2.js";
import { MODULE_3_CONTENT } from "./module-3.js";
import { MODULE_4_CONTENT } from "./module-4.js";
import { MODULE_PROMPT_BINDINGS_CONTENT, PROMPTS_CONTENT } from "./prompts.js";
import { PROGRAM_CONTENT } from "./program.js";

// The full expected content set for this Program Version. This is the
// canonical, reviewed content — not parsed from any Markdown spec at run
// time.
//
// Modules 0-4 are the whole of V1's shipped content. Modules 5/6 exist in
// packages/toolkit-content/manifest.json but are deliberately NOT seeded:
// they previously appeared as label-only draft placeholders, which bought
// a "coming soon" catalog row at the cost of a permanently draft Module
// row that publish.ts has to keep special-casing. Add them here (as real
// modules, with Questions/Artifacts) when their workflow spec exists; the
// living reconciler front-fills them into every in-flight Run at that
// point.
export const DEFAULT_TOOLKIT_CONTENT: ToolkitSeedContent = {
  program: PROGRAM_CONTENT,
  modules: [
    MODULE_0_CONTENT,
    MODULE_1_CONTENT,
    MODULE_2_CONTENT,
    MODULE_3_CONTENT,
    MODULE_4_CONTENT,
  ],
  prompts: PROMPTS_CONTENT,
  promptBindings: MODULE_PROMPT_BINDINGS_CONTENT,
};
