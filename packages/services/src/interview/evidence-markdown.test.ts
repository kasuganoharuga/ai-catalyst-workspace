import { describe, expect, it } from "vitest";

import { buildInterviewEvidenceMarkdown } from "./evidence-markdown.js";
import type { InterviewRecord } from "./types.js";

const questions = [
  { index: 1, text: "Tell me about the last time…" },
  { index: 2, text: "What did you do when…" },
  { index: 3, text: "Q3" },
  { index: 4, text: "Q4" },
  { index: 5, text: "Q5" },
];

function record(
  partial: Partial<InterviewRecord> &
    Pick<InterviewRecord, "id" | "sequenceIndex">,
): InterviewRecord {
  return {
    activityId: "act-1",
    intervieweeName: "Sarah Chen",
    company: "ABC Accounting",
    role: "Operations Manager",
    interviewedAt: "2026-08-08",
    answers: {
      "1": "Last quarter we missed a filing.",
      "2": "We used spreadsheets.",
      "3": "A3",
      "4": "A4",
      "5": "A5",
    },
    keyQuote: "We were flying blind.",
    currentWorkaround: "Manual spreadsheet",
    status: "completed",
    completedAt: "2026-08-08T12:00:00.000Z",
    createdAt: "2026-08-08T11:00:00.000Z",
    updatedAt: "2026-08-08T12:00:00.000Z",
    ...partial,
  };
}

describe("buildInterviewEvidenceMarkdown", () => {
  it("includes provenance comments and completed interviews only", () => {
    const markdown = buildInterviewEvidenceMarkdown({
      questions,
      records: [
        record({ id: "rec-1", sequenceIndex: 1 }),
        record({
          id: "rec-2",
          sequenceIndex: 2,
          status: "draft",
          completedAt: null,
          intervieweeName: "Draft Person",
        }),
      ],
      confirmedAtIso: "2026-08-09T00:00:00.000Z",
    });

    expect(markdown).toContain("# Customer Interview Evidence");
    expect(markdown).toContain('<!-- source_record_ids: ["rec-1"] -->');
    expect(markdown).toContain("<!-- interview_record_id: rec-1 -->");
    expect(markdown).toContain("Sarah Chen");
    expect(markdown).toContain("Tell me about the last time…");
    expect(markdown).toContain("We were flying blind.");
    expect(markdown).not.toContain("Draft Person");
    expect(markdown).toContain(
      "<!-- evidence_confirmed_at: 2026-08-09T00:00:00.000Z -->",
    );
  });
});
