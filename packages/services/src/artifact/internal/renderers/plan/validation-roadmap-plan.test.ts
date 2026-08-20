import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { expectedFieldNames } from "../manifest-fields.js";
import { VALIDATION_ROADMAP_FIELD_MANIFEST_V1 } from "../manifests/roadmap-v1.js";
import type { ValidationRoadmapModel } from "../parse/validation-roadmap.js";
import { renderWorkbookPlan } from "../pdf/render-plan.js";
import type { Provenance } from "../types.js";
import {
  assertValidationRoadmapPlan,
  buildValidationRoadmapPlan,
} from "./validation-roadmap-plan.js";

const TWO_EXPERIMENT_MODEL: ValidationRoadmapModel = {
  ventureName: "Kerbside",
  constraints: {
    timeAvailable: "6 hours a week",
    budget: "$500",
    customerAccess: "12 warm introductions from the Melbourne depot network",
  },
  whatTheseExperimentsTest:
    "Whether operations leads will take a concrete step toward solving reconciliation.",
  experiments: [
    {
      name: "Concierge pilot",
      claimTested:
        "Leads will hand over a real run sheet for manual reconciliation",
      passCondition: "3 of 8 leads send a run sheet within 48 hours",
      failCondition: "Fewer than 2 of 8 respond within a week",
      time: "4 hours/week",
      cost: "$0",
      signalStrength: "Behavioural",
      window: "Week 1",
    },
    {
      name: "Paid waitlist",
      claimTested: "Leads will pay a deposit to reserve a pilot slot",
      passCondition: "2 of 8 leads pay a $50 deposit",
      failCondition: "Zero leads pay within 2 weeks",
      time: "2 hours/week",
      cost: "$50",
      signalStrength: "Binding",
      window: "Week 2–3",
    },
  ],
  signalStrengthAnchors: [
    "Informational — produces only general information or weak indirect evidence",
    "Clarifying — clarifies an assumption but cannot establish customer behaviour",
    "Primary — can produce direct primary evidence from matching customers",
    "Behavioural — can produce an observable behavioural or commercial demand signal, including founder-prompted outreach (a CTA click after the Founder sends a page is Behavioural, not Evidence Maturity Level 4)",
    "Binding — can produce deposit paid, paid pilot signed, contract / PO, or actual payment (a verbal firm start date alone is not Binding)",
  ],
  startHere: {
    whatToDo:
      "Send the concierge pilot offer to all 8 warm introductions this week.",
    whoToContact: "The 8 Melbourne depot contacts, by direct message.",
    pass: "3 of 8 leads send a run sheet within 48 hours",
    fail: "Fewer than 2 of 8 respond within a week",
  },
  day30Decision: {
    proceedWhen:
      "Repeated pain confirmed, observable demand, and at least one deposit or paid pilot.",
    refineWhen: "Problem confirmed but demand or segment signals are mixed.",
    stopOrRescopeWhen:
      "Narrow segment mostly reports manageable pain or no willingness to act.",
  },
  howToRecordResults:
    "Keep the results with you and bring them into the review that follows.",
};

const THREE_EXPERIMENT_MODEL: ValidationRoadmapModel = {
  ...TWO_EXPERIMENT_MODEL,
  experiments: [
    ...TWO_EXPERIMENT_MODEL.experiments,
    {
      name: "Direct outreach",
      claimTested: "Cold-contacted leads will book a call",
      passCondition: "5 of 20 leads book a call",
      failCondition: "Fewer than 2 of 20 respond",
      time: "3 hours/week",
      cost: "$0",
      signalStrength: "Primary",
      window: "Week 3–4",
    },
  ],
};

const PROVENANCE: Provenance = {
  sourceArtifactId: "artifact-456",
  sourceArtifactVersion: 2,
  sourceContentHash: "sha256:cafef00d",
  rendererKey: "validation_roadmap_workbook_v1",
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

describe("buildValidationRoadmapPlan — plan structure", () => {
  it("produces cover material + 2 experiments * 2 pages for a 2-experiment model", () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    // Cover can spill to a second page once 30-Day Decision is included.
    expect(plan.pages).toHaveLength(6);
  });

  it("produces cover material + 3 experiments * 2 pages for a 3-experiment model, and never a blank page", () => {
    const plan = buildValidationRoadmapPlan(THREE_EXPERIMENT_MODEL, PROVENANCE);
    expect(plan.pages).toHaveLength(8);
    expect(
      plan.lockedContent.some((e) => e.role.startsWith("experiment_3.")),
    ).toBe(true);
    expect(
      plan.lockedContent.some((e) => e.role.startsWith("experiment_4.")),
    ).toBe(false);
  });

  it("produces exactly the field set the manifest declares for 2 experiments", () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    const expected = expectedFieldNames(VALIDATION_ROADMAP_FIELD_MANIFEST_V1, {
      sectionCount: 2,
      familyCount: () => 0,
    });
    expect(plan.fields.map((f) => f.name).sort()).toEqual(expected.sort());
  });

  it("every page has a footer label", () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    expect(plan.pages.every((p) => p.footerLabel !== null)).toBe(true);
  });

  it("only experiment 1 carries Start Here's execution guidance", () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    expect(
      plan.lockedContent.some(
        (e) => e.role === "experiment_1.start_here_what_to_do",
      ),
    ).toBe(true);
    expect(
      plan.lockedContent.some(
        (e) => e.role === "experiment_2.start_here_what_to_do",
      ),
    ).toBe(false);
  });
});

describe("buildValidationRoadmapPlan — every locked model field is present somewhere in the plan", () => {
  const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
  const allText = plan.lockedContent.map((e) => e.text).join("\n");

  it("includes venture name and constraints", () => {
    expect(allText).toContain(TWO_EXPERIMENT_MODEL.ventureName);
    expect(allText).toContain(TWO_EXPERIMENT_MODEL.constraints.timeAvailable);
    expect(allText).toContain(TWO_EXPERIMENT_MODEL.constraints.budget);
  });

  it("includes every experiment's pass and fail condition, on the cover AND its own page", () => {
    TWO_EXPERIMENT_MODEL.experiments.forEach((experiment, index) => {
      const passOccurrences = plan.lockedContent.filter((e) =>
        e.text.includes(experiment.passCondition),
      );
      const failOccurrences = plan.lockedContent.filter((e) =>
        e.text.includes(experiment.failCondition),
      );
      // Cover overview + the experiment's own page A, always. Experiment 1
      // gets a 3rd occurrence: Start Here's own "What counts as a
      // pass/fail" line on the cover, which is required to match
      // experiment 1's condition exactly (parse/validation-roadmap.ts
      // throws otherwise) — this is confirming that agreement, not a bug.
      const expected = index === 0 ? 3 : 2;
      expect(passOccurrences.length).toBe(expected);
      expect(failOccurrences.length).toBe(expected);
    });
  });

  it("includes all 5 signal strength anchors", () => {
    for (const anchor of TWO_EXPERIMENT_MODEL.signalStrengthAnchors) {
      expect(allText).toContain(anchor);
    }
  });

  it("never emits literal markdown emphasis markers", () => {
    expect(allText).not.toMatch(/\*\*/);
  });
});

describe("assertValidationRoadmapPlan", () => {
  it("does not throw for a plan honestly built from the model", () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    expect(() =>
      assertValidationRoadmapPlan(plan, TWO_EXPERIMENT_MODEL),
    ).not.toThrow();
  });

  it("throws when the model disagrees with what the plan actually contains (e.g. venture name)", () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    const otherModel: ValidationRoadmapModel = {
      ...TWO_EXPERIMENT_MODEL,
      ventureName: "A Different Venture",
    };
    expect(() => assertValidationRoadmapPlan(plan, otherModel)).toThrow(
      /WORKBOOK_RENDER_FAILED/,
    );
  });

  it("throws when an experiment's pass condition is missing from the plan", () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    const otherModel: ValidationRoadmapModel = {
      ...TWO_EXPERIMENT_MODEL,
      experiments: [
        {
          ...TWO_EXPERIMENT_MODEL.experiments[0],
          passCondition: "A pass condition that was never rendered.",
        },
        TWO_EXPERIMENT_MODEL.experiments[1],
      ],
    };
    expect(() => assertValidationRoadmapPlan(plan, otherModel)).toThrow(
      /WORKBOOK_RENDER_FAILED/,
    );
  });

  it("throws when a page has no footer label", () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    const brokenPlan = {
      ...plan,
      pages: [{ footerLabel: null }, ...plan.pages.slice(1)],
    };
    expect(() =>
      assertValidationRoadmapPlan(brokenPlan, TWO_EXPERIMENT_MODEL),
    ).toThrow(/footer/);
  });

  it("throws when locked content is placeholder text", () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    const brokenPlan = {
      ...plan,
      lockedContent: [
        { ...plan.lockedContent[0], text: "TBD" },
        ...plan.lockedContent.slice(1),
      ],
    };
    expect(() =>
      assertValidationRoadmapPlan(brokenPlan, TWO_EXPERIMENT_MODEL),
    ).toThrow(/placeholder/);
  });
});

describe("buildValidationRoadmapPlan -> renderWorkbookPlan — full pipeline", () => {
  it("renders to a valid PDF with the exact expected field set, no duplicates, one widget each", async () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPageCount()).toBe(6);
    const fields = doc.getForm().getFields();
    const names = fields.map((f) => f.getName());
    expect(new Set(names).size).toBe(names.length);
    for (const field of fields) {
      expect(field.acroField.getWidgets()).toHaveLength(1);
    }
  });

  it("draws the venture name on the cover page", async () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const text = await extractText(bytes, 1);
    expect(text).toContain("Kerbside");
  });

  it("the outcome and decision dropdowns carry the correct fixed option lists", async () => {
    const plan = buildValidationRoadmapPlan(TWO_EXPERIMENT_MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const doc = await PDFDocument.load(bytes);
    expect(
      doc.getForm().getDropdown("experiment_1.outcome").getOptions(),
    ).toEqual(["Pass", "Fail", "Inconclusive"]);
    expect(
      doc.getForm().getDropdown("experiment_1.decision").getOptions(),
    ).toEqual(["Continue", "Revise", "Stop"]);
  });

  it("no two fields on the same page overlap", async () => {
    const plan = buildValidationRoadmapPlan(THREE_EXPERIMENT_MODEL, PROVENANCE);
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
