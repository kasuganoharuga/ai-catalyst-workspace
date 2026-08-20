import { cache } from "react";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import {
  getModuleContext,
  listModuleContextsForActiveRun as listModuleContextsForActiveRunUncached,
} from "@ai-catalyst/services/module/context";
import { ServiceError } from "@ai-catalyst/services/errors";
import { listRunModules as listRunModulesUncached } from "@ai-catalyst/services/workflow";

// Thin Next.js shells over packages/services read paths — same pattern as
// lib/module-catalog.ts. Web stays on the read side of the Run/Attempt
// state machine; every write happens through MCP tools in the AI client.
export const listRunModules = cache(listRunModulesUncached);

export const listModuleContextsForActiveRun = cache(
  listModuleContextsForActiveRunUncached,
);

// `null` (rather than a throw) when the Founder has no Run yet or the
// moduleKey has no program_run_modules row — both are normal pre-setup
// states the status pages render, not errors.
export const getModuleContextByKey = cache(
  async (actor: ActorContext, moduleKey: string) => {
    try {
      return await getModuleContext(actor, { moduleKey });
    } catch (error) {
      if (error instanceof ServiceError && error.code === "NOT_FOUND") {
        return null;
      }
      throw error;
    }
  },
);
