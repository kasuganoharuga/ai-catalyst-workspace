import type { ToolkitSeedContent } from "../types.js";
import { MODULE_0_CONTENT } from "./module-0.js";
import { MODULE_1_CONTENT } from "./module-1.js";
import { buildPlaceholderModules } from "./module-placeholders.js";
import { MODULE_PROMPT_BINDINGS_CONTENT, PROMPTS_CONTENT } from "./prompts.js";
import { PROGRAM_CONTENT } from "./program.js";

// The full expected content set for the Program's first Program Version.
// This is the canonical, reviewed content — not parsed from any Markdown
// spec at run time.
export const DEFAULT_TOOLKIT_CONTENT: ToolkitSeedContent = {
  program: PROGRAM_CONTENT,
  modules: [MODULE_0_CONTENT, MODULE_1_CONTENT, ...buildPlaceholderModules()],
  prompts: PROMPTS_CONTENT,
  promptBindings: MODULE_PROMPT_BINDINGS_CONTENT,
};
