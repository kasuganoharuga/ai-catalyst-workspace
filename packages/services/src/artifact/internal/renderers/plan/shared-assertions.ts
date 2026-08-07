// Assertion primitives shared by both renderers' assertPlanMatchesModel —
// checks that apply identically regardless of which typed model produced
// the plan (footer presence, no placeholder text leaking through). Each
// renderer's own assertPlanMatchesModel (in its plan/*.ts file) calls these
// plus its own model-specific content-equality checks.
import { isPlaceholderText } from "@ai-catalyst/services/artifact/internal/markdown-sections";
import type { WorkbookRenderPlan } from "../types.js";

function fail(message: string): never {
  throw new Error(`WORKBOOK_RENDER_FAILED: ${message}`);
}

/** Every page must carry a footer label — the mechanism a printed workbook whose pages separate stays traceable (plan §9). */
export function assertFooterOnEveryPage(plan: WorkbookRenderPlan): void {
  plan.pages.forEach((page, index) => {
    if (page.footerLabel === null) {
      fail(`page ${index + 1} has no footer label.`);
    }
  });
}

/**
 * No locked content may be an unfilled `<hint>`, TBD/TODO, or dash-only
 * placeholder — reuses the exact patterns the structured-markdown-v1
 * validator already rejects at save time, so a renderer can never draw
 * something the validator would itself have refused to confirm.
 */
export function assertNoPlaceholderText(plan: WorkbookRenderPlan): void {
  for (const entry of plan.lockedContent) {
    if (isPlaceholderText(entry.text)) {
      fail(
        `locked content "${entry.role}" is placeholder text: "${entry.text}".`,
      );
    }
  }
}

/** Every value in `expected` must appear verbatim somewhere in the plan's locked content. */
export function assertAllPresent(
  plan: WorkbookRenderPlan,
  expected: readonly string[],
  label: string,
): void {
  const haystack = plan.lockedContent.map((entry) => entry.text);
  for (const value of expected) {
    if (!haystack.some((text) => text.includes(value))) {
      fail(`${label} "${value}" is missing from the plan's locked content.`);
    }
  }
}
