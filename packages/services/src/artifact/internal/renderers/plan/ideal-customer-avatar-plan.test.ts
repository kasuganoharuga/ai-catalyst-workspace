import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import type { IdealCustomerAvatarModel } from "../parse/ideal-customer-avatar.js";
import { renderWorkbookPlan } from "../pdf/render-plan.js";
import type { Provenance } from "../types.js";
import {
  assertIdealCustomerAvatarPlan,
  buildIdealCustomerAvatarPlan,
} from "./ideal-customer-avatar-plan.js";

const MODEL: IdealCustomerAvatarModel = {
  ventureName: "Kerbside",
  segment: "Australian pre-seed / seed founders raising $500k–$3M.",
  snapshot: {
    who: "32–42, technical or domain-expert founder; 2–8 person team.",
    where: "Sydney / Melbourne / Brisbane. Often accelerator-adjacent.",
    stage: "Post-MVP, $10k–$80k ARR or strong pilots. 6–12 months runway.",
    raise: "First institutional round. SAFE, note or priced seed.",
  },
  situation:
    "Has proven the product works and now needs capital to hire and scale.",
  unmetNeeds: {
    functional: [
      "Close the round in a defined window, not an open-ended drift.",
      "Avoid mistakes that cost them control.",
      "Know who to actually talk to.",
    ],
    emotional: [
      "Stop feeling like an outsider.",
      "Certainty over vibes.",
      "Protect their credibility.",
    ],
  },
  currentAlternatives: [
    "Runs the raise off spreadsheets and cold emails.",
    "Asks friends who raised before for informal advice.",
    "Uses a generic CRM not built for fundraising.",
  ],
  buyingSignals: {
    tier1: [
      "Searches how to raise a seed round.",
      "Downloads a capital-raising guide.",
      "Grabs a term sheet template.",
    ],
    tier2: [
      "First paying customers, first sales hire.",
      "Accepted into an accelerator.",
      "Signed up to cap table tooling.",
    ],
  },
  disqualifiers: [
    "Wants a broker to raise it for them.",
    "Already has a signed term sheet.",
    "Idea stage, pre-MVP.",
  ],
  corePromise:
    "Run a professional seed raise in a defined window, keep control, and own the process for next time.",
  validationStatus: {
    currentLevel: "Interviewed",
    basedOnObservation:
      "Three founders interviewed matched this profile closely.",
    founderAssumptions:
      "Raise timeline assumption not yet tested against a live process.",
    importantUnknowns: "Whether Tier 1 signals convert at the rate assumed.",
    contradictingEvidence: "None recorded yet.",
    highestPriorityQuestions:
      "Does the accelerator-adjacent channel actually produce warm introductions?",
  },
};

const PROVENANCE: Provenance = {
  sourceArtifactId: "artifact-222",
  sourceArtifactVersion: 2,
  sourceContentHash: "sha256:cafebabe",
  rendererKey: "ideal_customer_avatar_export_v1",
  rendererVersion: "1",
  generatedAt: "2026-08-07T00:00:00.000Z",
  workspaceId: "workspace-456",
  programRunId: "run-789",
  programVersionNumber: 1,
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

describe("buildIdealCustomerAvatarPlan — plan structure", () => {
  it("flows continuously with a footer on every page and no forced page-2 kicker", () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    expect(plan.pages.length).toBeGreaterThan(0);
    expect(plan.pages.every((p) => p.footerLabel !== null)).toBe(true);
    const roles = plan.lockedContent.map((e) => e.role);
    expect(roles).not.toContain("page2.kicker");
    // Disqualifiers are individual bullets, not a ·-joined line.
    expect(roles).toContain("disqualifiers.1");
    expect(roles).toContain("disqualifiers.2");
    expect(roles).toContain("disqualifiers.3");
    expect(plan.lockedContent.some((e) => e.text.includes("  ·  "))).toBe(
      false,
    );
  });

  it("declares no fields at all — this is a read-only export, not a fillable workbook", () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    expect(plan.fields).toEqual([]);
  });

  it("draws at least one background fill (the navy masthead)", () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    expect(plan.rects.length).toBeGreaterThan(0);
  });

  it("never emits literal markdown emphasis markers", () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    const allText = plan.lockedContent.map((e) => e.text).join("\n");
    expect(allText).not.toMatch(/\*\*/);
  });
});

describe("buildIdealCustomerAvatarPlan — every locked model field is present somewhere in the plan", () => {
  const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
  const allText = plan.lockedContent.map((e) => e.text).join("\n");

  it("includes venture name, segment and every snapshot field", () => {
    expect(allText).toContain(MODEL.ventureName);
    expect(allText).toContain(MODEL.segment);
    expect(allText).toContain(MODEL.snapshot.who);
    expect(allText).toContain(MODEL.snapshot.where);
    expect(allText).toContain(MODEL.snapshot.stage);
    expect(allText).toContain(MODEL.snapshot.raise);
  });

  it("includes the situation, every unmet need, current alternative and buying signal", () => {
    expect(allText).toContain(MODEL.situation);
    for (const need of [
      ...MODEL.unmetNeeds.functional,
      ...MODEL.unmetNeeds.emotional,
    ]) {
      expect(allText).toContain(need);
    }
    for (const alternative of MODEL.currentAlternatives) {
      expect(allText).toContain(alternative);
    }
    for (const signal of [
      ...MODEL.buyingSignals.tier1,
      ...MODEL.buyingSignals.tier2,
    ]) {
      expect(allText).toContain(signal);
    }
  });

  it("includes every disqualifier and the core promise", () => {
    for (const disqualifier of MODEL.disqualifiers) {
      expect(allText).toContain(disqualifier);
    }
    expect(allText).toContain(MODEL.corePromise);
  });

  it("includes every Validation Status field as structured rows", () => {
    expect(allText).toContain(MODEL.validationStatus.currentLevel);
    expect(allText).toContain(MODEL.validationStatus.basedOnObservation);
    expect(allText).toContain(MODEL.validationStatus.contradictingEvidence);
    const roles = plan.lockedContent.map((e) => e.role);
    expect(roles).toContain("validation_status.current_level");
    expect(roles).toContain("validation_status.highest_priority_questions");
  });
});

describe("assertIdealCustomerAvatarPlan", () => {
  it("does not throw for a plan honestly built from the model", () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    expect(() => assertIdealCustomerAvatarPlan(plan, MODEL)).not.toThrow();
  });

  it("throws when the model disagrees with what the plan actually contains", () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    const otherModel: IdealCustomerAvatarModel = {
      ...MODEL,
      ventureName: "A Different Venture",
    };
    expect(() => assertIdealCustomerAvatarPlan(plan, otherModel)).toThrow(
      /WORKBOOK_RENDER_FAILED/,
    );
  });

  it("throws when a page has no footer label", () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    const brokenPlan = {
      ...plan,
      pages: [{ footerLabel: null }, ...plan.pages.slice(1)],
    };
    expect(() => assertIdealCustomerAvatarPlan(brokenPlan, MODEL)).toThrow(
      /footer/,
    );
  });

  it("throws when locked content is placeholder text", () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    const brokenPlan = {
      ...plan,
      lockedContent: [
        { ...plan.lockedContent[0], text: "TBD" },
        ...plan.lockedContent.slice(1),
      ],
    };
    expect(() => assertIdealCustomerAvatarPlan(brokenPlan, MODEL)).toThrow(
      /placeholder/,
    );
  });
});

describe("buildIdealCustomerAvatarPlan -> renderWorkbookPlan — full pipeline", () => {
  it("renders to a valid PDF with no form fields at all", async () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(plan.pages.length);
    expect(doc.getForm().getFields()).toHaveLength(0);
  });

  it("draws the venture name and title on the first page", async () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const text = await extractText(bytes, 1);
    expect(text).toContain("Kerbside");
    expect(text).toContain("Ideal Customer Avatar");
  });

  it("draws the core promise somewhere in the document", async () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const allText = (
      await Promise.all(plan.pages.map((_, i) => extractText(bytes, i + 1)))
    ).join(" ");
    expect(allText).toContain("Run a professional seed raise");
  });

  it("prints a simple product footer, not technical provenance", async () => {
    const plan = buildIdealCustomerAvatarPlan(MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const page1 = await extractText(bytes, 1);
    expect(page1).toContain("AI Catalyst");
    expect(page1).toContain("Ideal Customer Avatar");
    expect(page1).toContain("Page 1 of");
    expect(page1).not.toContain("Artifact version");
    expect(page1).not.toContain("ideal_customer_avatar_export_v1");
  });
});
