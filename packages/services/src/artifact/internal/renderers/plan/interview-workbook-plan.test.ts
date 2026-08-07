import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { expectedFieldNames } from "../manifest-fields.js";
import { PROBLEM_INTERVIEW_FIELD_MANIFEST_V1 } from "../manifests/interview-v1.js";
import type { InterviewGuideModel } from "../parse/interview-guide.js";
import { renderWorkbookPlan } from "../pdf/render-plan.js";
import type { Provenance } from "../types.js";
import {
  assertInterviewWorkbookPlan,
  buildInterviewWorkbookPlan,
} from "./interview-workbook-plan.js";

const MODEL: InterviewGuideModel = {
  ventureName: "Kerbside",
  interviewTarget:
    "Operations leads at 50–200 person waste-collection contractors in metro Australia.",
  whatThisInterviewTests:
    "Whether route supervisors lose recoverable hours to manual reconciliation.",
  questions: [
    "Tell me about the last time a run sheet did not match what the trucks actually did.",
    "How often does that happen in a typical month?",
    "What have you already tried or bought to stop it happening?",
    "Walk me through what you did the last time it happened.",
    "Where does this sit against everything else on your plate this quarter?",
  ],
  momTestRules: [
    "Ask about what actually happened, never about what they would do.",
    "Do not describe the product until the conversation is over.",
    "Treat compliments as noise and steer back to a past occurrence.",
    "Ask for numbers they already know, never numbers they would estimate.",
  ],
  passBar: {
    preamble:
      "For this five-interview validation round, the problem meets the pass bar when at least 3 of 5 interviews satisfy the conditions below:",
    conditions: [
      "Described a specific reconciliation failure from the last 60 days.",
      "Named a cost in hours or dollars for that occurrence.",
      "Has already spent money, staff time or tooling on the problem.",
    ],
  },
  killCriteria: [
    "The supervisor treats the work as normal and shows no interest in removing it.",
    "The cost per occurrence is under one hour of a supervisor's time.",
    "An existing tool would solve it if configured.",
  ],
  afterEachCall: [
    "Write the verbatim notes within 30 minutes.",
    "Record the customer's own words rather than a summary.",
  ],
  whereResultsGo:
    "Run the five conversations and bring the notes into the next module.",
};

const PROVENANCE: Provenance = {
  sourceArtifactId: "artifact-123",
  sourceArtifactVersion: 3,
  sourceContentHash: "sha256:deadbeef",
  rendererKey: "problem_interview_workbook_v1",
  rendererVersion: "1",
  generatedAt: "2026-08-07T00:00:00.000Z",
  workspaceId: "workspace-456",
  programRunId: "run-789",
  programVersionNumber: 7,
};

async function extractText(bytes: Buffer, pageNumber: number): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) })
    .promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("buildInterviewWorkbookPlan — plan structure", () => {
  it("produces 1 reference + 5 sections * 2 pages + 1 handoff = 12 pages by default", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    expect(plan.pages).toHaveLength(12);
  });

  it("produces 14 pages for a 6-section round (1 additional interview)", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE, {
      sectionCount: 6,
    });
    expect(plan.pages).toHaveLength(14);
  });

  it("produces exactly the field set the manifest declares for a 3-condition Pass Bar", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const expected = expectedFieldNames(PROBLEM_INTERVIEW_FIELD_MANIFEST_V1, {
      sectionCount: 5,
      familyCount: () => MODEL.passBar.conditions.length,
    });
    expect(plan.fields.map((f) => f.name).sort()).toEqual(expected.sort());
  });

  it("produces the right field set for a 4-condition Pass Bar (no missing/extra checkbox)", () => {
    const fourConditionModel: InterviewGuideModel = {
      ...MODEL,
      passBar: {
        ...MODEL.passBar,
        conditions: [...MODEL.passBar.conditions, "A fourth condition."],
      },
    };
    const plan = buildInterviewWorkbookPlan(fourConditionModel, PROVENANCE);
    expect(plan.fields.some((f) => f.name === "interview_1.pass_bar_4")).toBe(
      true,
    );
    expect(plan.fields.some((f) => f.name === "interview_1.pass_bar_5")).toBe(
      false,
    );
  });

  it("titles sections beyond the round as Additional interview, never renumbered into it", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE, {
      sectionCount: 6,
    });
    const titleEntry = plan.lockedContent.find(
      (e) => e.role === "interview_6.page_a_title",
    );
    expect(titleEntry?.text).toBe("Additional interview 1");
  });

  it("every page has a footer label (none null) — the overflow-page regression this pattern exists to prevent", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    expect(plan.pages.every((p) => p.footerLabel !== null)).toBe(true);
  });

  it("rejects a section count outside the manifest's 5-10 range", () => {
    expect(() =>
      buildInterviewWorkbookPlan(MODEL, PROVENANCE, { sectionCount: 4 }),
    ).toThrow(/WORKBOOK_RENDER_FAILED/);
    expect(() =>
      buildInterviewWorkbookPlan(MODEL, PROVENANCE, { sectionCount: 11 }),
    ).toThrow(/WORKBOOK_RENDER_FAILED/);
  });
});

describe("buildInterviewWorkbookPlan — every locked model field is present somewhere in the plan", () => {
  const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
  const allText = plan.lockedContent.map((e) => e.text).join("\n");

  it("includes the venture name, interview target and what-this-tests", () => {
    expect(allText).toContain(MODEL.ventureName);
    expect(allText).toContain(MODEL.interviewTarget);
    expect(allText).toContain(MODEL.whatThisInterviewTests);
  });

  it("includes all 5 questions on the reference page AND restated in every section", () => {
    for (const question of MODEL.questions) {
      const occurrences = plan.lockedContent.filter((e) =>
        e.text.includes(question),
      );
      // 1 reference-page occurrence + 5 section restatements = 6.
      expect(occurrences.length).toBe(6);
    }
  });

  it("includes the Pass Bar preamble and every condition on the reference page", () => {
    expect(allText).toContain(MODEL.passBar.preamble);
    for (const condition of MODEL.passBar.conditions) {
      expect(allText).toContain(condition);
    }
  });

  it("includes all 3 kill criteria", () => {
    for (const criterion of MODEL.killCriteria) {
      expect(allText).toContain(criterion);
    }
  });

  it("never emits literal markdown emphasis markers in drawn text", () => {
    expect(allText).not.toMatch(/\*\*/);
  });

  it("includes the fixed observation note once per section", () => {
    const occurrences = plan.lockedContent.filter((e) =>
      e.role.endsWith(".observation_note"),
    );
    expect(occurrences).toHaveLength(5);
  });
});

describe("assertInterviewWorkbookPlan", () => {
  it("does not throw for a plan honestly built from the model", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    expect(() => assertInterviewWorkbookPlan(plan, MODEL)).not.toThrow();
  });

  it("throws when the model disagrees with what the plan actually contains (e.g. venture name)", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const otherModel: InterviewGuideModel = {
      ...MODEL,
      ventureName: "A Completely Different Venture",
    };
    expect(() => assertInterviewWorkbookPlan(plan, otherModel)).toThrow(
      /WORKBOOK_RENDER_FAILED/,
    );
  });

  it("throws when a question is missing from the plan", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const otherModel: InterviewGuideModel = {
      ...MODEL,
      questions: [
        ...MODEL.questions.slice(0, 4),
        "A question that was never rendered anywhere.",
      ] as InterviewGuideModel["questions"],
    };
    expect(() => assertInterviewWorkbookPlan(plan, otherModel)).toThrow(
      /WORKBOOK_RENDER_FAILED/,
    );
  });

  it("throws when a page has no footer label, even if content otherwise matches (the overflow-page regression)", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const brokenPlan = {
      ...plan,
      pages: [{ footerLabel: null }, ...plan.pages.slice(1)],
    };
    expect(() => assertInterviewWorkbookPlan(brokenPlan, MODEL)).toThrow(
      /footer/,
    );
  });

  it("throws when locked content is placeholder text", () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const brokenPlan = {
      ...plan,
      lockedContent: [
        { ...plan.lockedContent[0], text: "TBD" },
        ...plan.lockedContent.slice(1),
      ],
    };
    expect(() => assertInterviewWorkbookPlan(brokenPlan, MODEL)).toThrow(
      /placeholder/,
    );
  });
});

describe("buildInterviewWorkbookPlan -> renderWorkbookPlan — full pipeline", () => {
  it("renders to a valid PDF with the exact expected field set, no duplicates, one widget each", async () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBe(12);
    const fields = doc.getForm().getFields();
    const names = fields.map((f) => f.getName());
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(120);
    for (const field of fields) {
      expect(field.acroField.getWidgets()).toHaveLength(1);
    }
  });

  it("draws the venture name and a question on the reference page", async () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const text = await extractText(bytes, 1);
    expect(text).toContain("Kerbside");
    expect(text).toContain(
      "Tell me about the last time a run sheet did not match",
    );
  });

  it("draws the question restated on interview 1's page A, beside its notes field", async () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const text = await extractText(bytes, 2); // page 1 = reference, page 2 = interview_1 page A
    expect(text).toContain(
      "Tell me about the last time a run sheet did not match",
    );
  });

  it("draws the handoff copy on the last page", async () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const text = await extractText(bytes, 12);
    expect(text).toContain("Return to Module 4");
  });

  it("respects the Pass Bar field capacity from the manifest", async () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const doc = await PDFDocument.load(bytes);
    expect(
      doc.getForm().getTextField("interview_1.verbatim_quotes").getMaxLength(),
    ).toBe(620);
  });

  it("no two fields on the same page overlap (regression: checkbox border inflation once overlapped adjacent rows)", async () => {
    const plan = buildInterviewWorkbookPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const doc = await PDFDocument.load(bytes);
    const pageRefToIndex = new Map(
      doc.getPages().map((p, i) => [p.ref.toString(), i]),
    );
    const byPage = new Map<
      number,
      { name: string; x: number; y: number; w: number; h: number }[]
    >();
    for (const field of doc.getForm().getFields()) {
      const widget = field.acroField.getWidgets()[0];
      const rect = widget.getRectangle();
      const pageRef = widget.P?.();
      const pageIndex = pageRef
        ? pageRefToIndex.get(pageRef.toString())
        : undefined;
      if (pageIndex === undefined) continue;
      const list = byPage.get(pageIndex) ?? [];
      list.push({
        name: field.getName(),
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
      });
      byPage.set(pageIndex, list);
    }
    const overlaps: string[] = [];
    for (const fields of byPage.values()) {
      for (let i = 0; i < fields.length; i += 1) {
        for (let j = i + 1; j < fields.length; j += 1) {
          const a = fields[i];
          const b = fields[j];
          const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
          const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
          if (overlapX && overlapY) overlaps.push(`${a.name} vs ${b.name}`);
        }
      }
    }
    expect(overlaps).toEqual([]);
  });
});
