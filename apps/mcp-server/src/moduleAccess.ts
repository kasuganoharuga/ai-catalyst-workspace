import { findModuleState } from "./storage/repository.js";
import type { ModuleStateEntry, ProjectState } from "./storage/types.js";

export type ModuleAccessError = { error_code: string; message: string };

export type ModuleAccessResult =
  | { ok: true; module: ModuleStateEntry }
  | { ok: false; error: ModuleAccessError };

/**
 * Resolves "the current working module" for the AI - the only priority
 * order get_current_module is allowed to use. A `locked` module is never a
 * valid "current" module; if nothing matches, there is nothing for the AI to
 * work on right now (e.g. everything is either locked or already completed).
 */
export function resolveCurrentModule(state: ProjectState): ModuleStateEntry | undefined {
  return (
    state.modules.find((entry) => entry.status === "in_progress") ??
    state.modules.find((entry) => entry.status === "needs_revision") ??
    state.modules.find((entry) => entry.status === "ready_to_unlock")
  );
}

/**
 * Resolves a specific requested module id against project state, refusing
 * (MODULE_LOCKED) if it is locked. This is the single place the "never
 * expose a locked module's requirements" rule lives - every tool and web
 * route that accepts an explicit module_id must go through this, not
 * re-implement the locked check inline.
 */
export function resolveRequestedModule(state: ProjectState, moduleId: string): ModuleAccessResult {
  const module = findModuleState(state, moduleId);
  if (!module) {
    return {
      ok: false,
      error: { error_code: "UNKNOWN_MODULE", message: `Module ${moduleId} was not found in the project state.` },
    };
  }
  if (module.status === "locked") {
    return {
      ok: false,
      error: {
        error_code: "MODULE_LOCKED",
        message: `Module ${moduleId} is locked. It has not been unlocked by the website yet.`,
      },
    };
  }
  return { ok: true, module };
}
