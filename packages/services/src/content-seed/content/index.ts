import type { ToolkitSeedContent } from "../types.js";
import { MODULE_0_CONTENT } from "./module-0.js";
import { MODULE_1_CONTENT } from "./module-1.js";
import { MODULE_2_CONTENT } from "./module-2.js";
import { MODULE_3_CONTENT } from "./module-3.js";
import { MODULE_4_CONTENT } from "./module-4.js";
import { MODULE_5_CONTENT } from "./module-5.js";
import { MODULE_6_CONTENT } from "./module-6.js";
import { MODULE_7_CONTENT } from "./module-7.js";
import { MODULE_PROMPT_BINDINGS_CONTENT, PROMPTS_CONTENT } from "./prompts.js";
import { PROGRAM_CONTENT } from "./program.js";

// Canonical seed content — not parsed from Markdown at runtime.
//
// The full 1-7 sequence is now seeded: Pressure-Test → ICA → Problem →
// Solution → Epics → Competitive → Business model. Modules 5-7 previously
// stayed out because only label-only placeholders existed; they now have
// real question rows, artifacts and prompts ported from their reviewed
// prompt sets under packages/toolkit-content/skills/.
export const DEFAULT_TOOLKIT_CONTENT: ToolkitSeedContent = {
  program: PROGRAM_CONTENT,
  modules: [
    MODULE_0_CONTENT,
    MODULE_1_CONTENT,
    MODULE_2_CONTENT,
    MODULE_3_CONTENT,
    MODULE_4_CONTENT,
    MODULE_5_CONTENT,
    MODULE_6_CONTENT,
    MODULE_7_CONTENT,
  ],
  prompts: PROMPTS_CONTENT,
  promptBindings: MODULE_PROMPT_BINDINGS_CONTENT,
};
