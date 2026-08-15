import { describe, expect, it } from "vitest";

import { assertPdfStructure } from "./assert-pdf-structure.js";
import { IDEAL_CUSTOMER_AVATAR_FIELD_MANIFEST_V1 } from "./manifests/ideal-customer-avatar-v1.js";
import { PROBLEM_INTERVIEW_FIELD_MANIFEST_V1 } from "./manifests/interview-v1.js";
import { VALIDATION_ROADMAP_FIELD_MANIFEST_V1 } from "./manifests/roadmap-v1.js";
import type { IdealCustomerAvatarModel } from "./parse/ideal-customer-avatar.js";
import type { InterviewGuideModel } from "./parse/interview-guide.js";
import type { ValidationRoadmapModel } from "./parse/validation-roadmap.js";
import { renderWorkbookPlan } from "./pdf/render-plan.js";
import { buildIdealCustomerAvatarPlan } from "./plan/ideal-customer-avatar-plan.js";
import { buildInterviewWorkbookPlan } from "./plan/interview-workbook-plan.js";
import { buildValidationRoadmapPlan } from "./plan/validation-roadmap-plan.js";
import type { Provenance } from "./types.js";

const INTERVIEW_MODEL: InterviewGuideModel = {
  ventureName: "Kerbside",
  interviewTarget:
    "Operations leads at 50–200 person waste-collection contractors in metro Australia.",
  whatThisInterviewTests:
    "Whether route supervisors lose recoverable hours to manual reconciliation.",
  openingScript:
    "Thanks for the time. I'm researching how operations leads run reconciliation today — I'm not selling anything.",
  questions: [
    "Tell me about the last time a run sheet did not match what the trucks actually did.",
    "How often does that happen in a typical month?",
    "What have you already tried or bought to stop it happening?",
    "Walk me through what you did the last time it happened.",
    "Where does this sit against everything else on your plate this quarter?",
  ],
  questionGuidance: [
    {
      listenFor: ["A specific, dated occurrence.", "A named system involved."],
      suggestion: "Ask them to walk through the exact moment they noticed it.",
    },
    {
      listenFor: ["A stated frequency, not 'sometimes'."],
      suggestion: "Push for a number even if they resist.",
    },
    {
      listenFor: ["A named tool or spend.", "An abandoned attempt."],
      suggestion: "Ask what they tried and stopped using.",
    },
    {
      listenFor: ["Who absorbed the extra work."],
      suggestion: "Ask what happened to the process afterwards.",
    },
    {
      listenFor: ["A named competing priority."],
      suggestion: "Ask what they fixed instead this quarter.",
    },
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
  assumptions: [
    {
      assumption: "Supervisors lose 2+ hours per week reconciling run sheets.",
      validatedIf: "Interviewee names a specific weekly time cost of 2+ hours.",
      invalidatedIf: "Reconciliation already takes under 30 minutes.",
    },
    {
      assumption: "The mismatch is discovered reactively.",
      validatedIf: "Interviewee describes finding out by chance.",
      invalidatedIf: "Existing tooling already flags mismatches proactively.",
    },
    {
      assumption: "A paid or abandoned tool already exists for this problem.",
      validatedIf: "Interviewee names a specific tool they paid for or tried.",
      invalidatedIf: "No tool has ever been tried or purchased for this.",
    },
  ],
  closingQuestions: [
    "Is there anyone else you'd suggest I speak to who deals with this?",
    "Would you be open to trying it first, if we build a solution?",
  ],
  afterEachCall: [
    "Write the verbatim notes within 30 minutes.",
    "Record the customer's own words rather than a summary.",
  ],
  whereResultsGo:
    "Run the five conversations and bring the notes into the next module.",
};

const ROADMAP_MODEL: ValidationRoadmapModel = {
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
    "Behavioural — can produce an observable behavioural or commercial demand signal",
    "Binding — can produce deposit paid, paid pilot signed, contract / PO, or actual payment",
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

describe("assertPdfStructure — problem_interview_workbook_v1", () => {
  it("passes for a plan and PDF that honestly agree", async () => {
    const plan = buildInterviewWorkbookPlan(INTERVIEW_MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    await expect(
      assertPdfStructure(bytes, plan, PROBLEM_INTERVIEW_FIELD_MANIFEST_V1),
    ).resolves.toBeUndefined();
  });

  it("throws when a field in the plan has no matching manifest entry", async () => {
    const plan = buildInterviewWorkbookPlan(INTERVIEW_MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const brokenPlan = {
      ...plan,
      fields: [
        { ...plan.fields[0], name: "interview_1.not_a_real_field" },
        ...plan.fields.slice(1),
      ],
    };
    await expect(
      assertPdfStructure(
        bytes,
        brokenPlan,
        PROBLEM_INTERVIEW_FIELD_MANIFEST_V1,
      ),
    ).rejects.toThrow(/no matching entry in the field manifest/);
  });

  it("throws when the plan and the actual PDF disagree on the field set", async () => {
    const plan = buildInterviewWorkbookPlan(INTERVIEW_MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const brokenPlan = { ...plan, fields: plan.fields.slice(1) };
    await expect(
      assertPdfStructure(
        bytes,
        brokenPlan,
        PROBLEM_INTERVIEW_FIELD_MANIFEST_V1,
      ),
    ).rejects.toThrow(/the plan never declared/);
  });

  it("throws when the plan's page count disagrees with the rendered PDF", async () => {
    const plan = buildInterviewWorkbookPlan(INTERVIEW_MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const brokenPlan = { ...plan, pages: plan.pages.slice(0, -1) };
    await expect(
      assertPdfStructure(
        bytes,
        brokenPlan,
        PROBLEM_INTERVIEW_FIELD_MANIFEST_V1,
      ),
    ).rejects.toThrow(/pages but the plan expected/);
  });

  it("throws when the plan's provenance disagrees with the PDF's Info dictionary", async () => {
    const plan = buildInterviewWorkbookPlan(INTERVIEW_MODEL, PROVENANCE);
    const bytes = await renderWorkbookPlan(plan);
    const brokenPlan = {
      ...plan,
      provenance: {
        ...plan.provenance,
        sourceArtifactId: "a-different-artifact",
      },
    };
    await expect(
      assertPdfStructure(
        bytes,
        brokenPlan,
        PROBLEM_INTERVIEW_FIELD_MANIFEST_V1,
      ),
    ).rejects.toThrow(/SourceArtifactId/);
  });
});

describe("assertPdfStructure — validation_roadmap_workbook_v1", () => {
  it("passes for a plan and PDF that honestly agree, including dropdown options", async () => {
    const plan = buildValidationRoadmapPlan(ROADMAP_MODEL, {
      ...PROVENANCE,
      rendererKey: "validation_roadmap_workbook_v1",
    });
    const bytes = await renderWorkbookPlan(plan);
    await expect(
      assertPdfStructure(bytes, plan, VALIDATION_ROADMAP_FIELD_MANIFEST_V1),
    ).resolves.toBeUndefined();
  });

  it("throws when the plan's dropdown options disagree with the manifest", async () => {
    const plan = buildValidationRoadmapPlan(ROADMAP_MODEL, {
      ...PROVENANCE,
      rendererKey: "validation_roadmap_workbook_v1",
    });
    const bytes = await renderWorkbookPlan(plan);
    const dropdownIndex = plan.fields.findIndex(
      (f) => f.kind === "dropdown" && f.name === "experiment_1.outcome",
    );
    const dropdownField = plan.fields[dropdownIndex];
    if (dropdownField.kind !== "dropdown")
      throw new Error("fixture field is not a dropdown");
    const brokenPlan = {
      ...plan,
      fields: [
        ...plan.fields.slice(0, dropdownIndex),
        { ...dropdownField, options: ["Yes", "No"] },
        ...plan.fields.slice(dropdownIndex + 1),
      ],
    };
    await expect(
      assertPdfStructure(
        bytes,
        brokenPlan,
        VALIDATION_ROADMAP_FIELD_MANIFEST_V1,
      ),
    ).rejects.toThrow(/manifest declares/);
  });
});

const AVATAR_MODEL: IdealCustomerAvatarModel = {
  ventureName: "Kerbside",
  segment: "Australian pre-seed / seed founders raising $500k–$3M.",
  snapshot: {
    who: "32–42, technical or domain-expert founder; 2–8 person team.",
    where: "Sydney / Melbourne / Brisbane.",
    stage: "Post-MVP, $10k–$80k ARR or strong pilots.",
    raise: "First institutional round. SAFE, note or priced seed.",
  },
  situation:
    "Has proven the product works and now needs capital to hire and scale.",
  unmetNeeds: {
    functional: [
      "Close the round in a defined window.",
      "Avoid mistakes that cost them control.",
      "Know who to talk to.",
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
      "First paying customers.",
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
    founderAssumptions: "Raise timeline assumption not yet tested.",
    importantUnknowns: "Whether Tier 1 signals convert at the rate assumed.",
    contradictingEvidence: "None recorded yet.",
    highestPriorityQuestions:
      "Does the accelerator-adjacent channel actually produce warm introductions?",
  },
};

describe("assertPdfStructure — ideal_customer_avatar_export_v1", () => {
  it("passes for a plan and PDF that honestly agree, with zero form fields", async () => {
    const plan = buildIdealCustomerAvatarPlan(AVATAR_MODEL, {
      ...PROVENANCE,
      rendererKey: "ideal_customer_avatar_export_v1",
    });
    const bytes = await renderWorkbookPlan(plan);
    await expect(
      assertPdfStructure(bytes, plan, IDEAL_CUSTOMER_AVATAR_FIELD_MANIFEST_V1),
    ).resolves.toBeUndefined();
  });
});
