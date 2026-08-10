import type { ToolkitSeedContent } from "../types.js";
import { MODULE_0_CONTENT } from "./module-0.js";
import { MODULE_1_CONTENT } from "./module-1.js";
import { MODULE_2_CONTENT } from "./module-2.js";
import { MODULE_3_CONTENT } from "./module-3.js";
import { MODULE_4_CONTENT } from "./module-4.js";
import { MODULE_PROMPT_BINDINGS_CONTENT, PROMPTS_CONTENT } from "./prompts.js";
import { PROGRAM_CONTENT } from "./program.js";

// Canonical V1 seed content (Modules 0-4 only) — not parsed from Markdown at runtime.
// Modules 5/6 stay out until real workflow specs exist; label-only placeholders forced publish.ts special-casing.
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
