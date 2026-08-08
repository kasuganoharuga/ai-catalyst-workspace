import { describe, expect, it } from "vitest";

import type { LockedContentEntry, WorkbookRenderPlan } from "../types.js";
import {
  assertAllPresent,
  assertFooterOnEveryPage,
  assertNoPlaceholderText,
} from "./shared-assertions.js";

function lockedEntry(
  overrides: Partial<LockedContentEntry> = {},
): LockedContentEntry {
  return {
    role: "test_field",
    text: "some text",
    page: 0,
    x: 0,
    y: 0,
    maxWidth: 100,
    size: 9,
    bold: false,
    ...overrides,
  };
}

function plan(lockedContent: LockedContentEntry[]): WorkbookRenderPlan {
  return {
    pages: [{ footerLabel: "page 1" }],
    fields: [],
    lockedContent,
    rects: [],
    provenance: {
      rendererKey: "test_renderer",
      rendererVersion: "1",
      sourceArtifactId: "artifact",
      sourceArtifactVersion: 1,
      sourceContentHash: "hash",
      generatedAt: "2026-01-01T00:00:00.000Z",
      workspaceId: "workspace",
      programRunId: "run",
      programVersionNumber: 1,
    },
  };
}

describe("assertFooterOnEveryPage", () => {
  it("does not throw when every page has a footer label", () => {
    expect(() => assertFooterOnEveryPage(plan([]))).not.toThrow();
  });

  it("throws, naming the page, when a footer label is missing", () => {
    const bad = plan([]);
    bad.pages.push({ footerLabel: null });
    expect(() => assertFooterOnEveryPage(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*page 2/,
    );
  });
});

describe("assertNoPlaceholderText", () => {
  it("does not throw for real content", () => {
    expect(() =>
      assertNoPlaceholderText(plan([lockedEntry({ text: "A real answer." })])),
    ).not.toThrow();
  });

  it("throws, naming the role, for placeholder text", () => {
    expect(() =>
      assertNoPlaceholderText(
        plan([lockedEntry({ role: "who", text: "<hint>" })]),
      ),
    ).toThrow(/WORKBOOK_RENDER_FAILED.*who/);
  });
});

describe("assertAllPresent", () => {
  it("does not throw when the expected value appears verbatim", () => {
    expect(() =>
      assertAllPresent(
        plan([lockedEntry({ text: "the confirmed customer profile" })]),
        ["confirmed customer profile"],
        "snapshot field",
      ),
    ).not.toThrow();
  });

  it("throws, naming the missing value, when it appears nowhere", () => {
    expect(() =>
      assertAllPresent(
        plan([lockedEntry({ text: "unrelated text" })]),
        ["missing value"],
        "snapshot field",
      ),
    ).toThrow(/WORKBOOK_RENDER_FAILED.*missing value/);
  });

  // Regression test: lockedText() (layout-builder.ts) sanitises text for
  // font coverage before it ever reaches plan.lockedContent, so a raw
  // model value containing an arrow, a checkmark or a stroked letter must
  // be sanitised the same way before comparison — otherwise this would
  // fail on every real profile whose source field happened to contain one
  // of those characters, exactly what the original bug report hit.
  it("matches after sanitising an expected value the same way lockedText did", () => {
    const rawValue =
      "The managing partner → ops manager line holds, and ✓ Xero is used; contact Łukasz for detail.";
    const sanitizedAsDrawn =
      "The managing partner  >  ops manager line holds, and (ok) Xero is used; contact Lukasz for detail.";
    expect(() =>
      assertAllPresent(
        plan([lockedEntry({ text: sanitizedAsDrawn })]),
        [rawValue],
        "validation status field",
      ),
    ).not.toThrow();
  });
});
