import { describe, expect, it } from "vitest";

import type { ModuleAttemptStatus } from "@ai-catalyst/shared";
import type { AttemptRow } from "@ai-catalyst/services/attempt/internal/rows";

import type { ResponseLookupRow } from "@ai-catalyst/services/module/internal/context-rows";
import {
  attemptHasAnsweredResponses,
  attemptHasCurrentQuestionResponses,
  buildInterviewGateStatus,
  isAttemptArtifactOwner,
  resolveReadResponseAttemptId,
} from "./context-assemble.js";

function attemptRow(
  id: string,
  overrides: Partial<AttemptRow> = {},
): AttemptRow {
  return {
    id,
    program_run_module_id: "run-module-1",
    attempt_number: 1,
    attempt_type: "initial",
    status: "draft",
    based_on_attempt_id: null,
    started_via: "website",
    submitted_at: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function responseRow(
  status: ResponseLookupRow["response_status"],
  answerText: string | null = "some answer",
): ResponseLookupRow {
  return {
    question_key: "q1",
    response_status: status,
    answer_text: answerText,
  };
}

describe("isAttemptArtifactOwner", () => {
  const owningStatuses: ModuleAttemptStatus[] = [
    "submitted",
    "ready_for_review",
    "accepted",
  ];
  const nonOwningStatuses: ModuleAttemptStatus[] = [
    "draft",
    "in_progress",
    "validation_failed",
    "rejected",
    "cancelled",
  ];

  it.each(owningStatuses)("returns true for %s", (status) => {
    expect(isAttemptArtifactOwner(status)).toBe(true);
  });

  it.each(nonOwningStatuses)("returns false for %s", (status) => {
    expect(isAttemptArtifactOwner(status)).toBe(false);
  });
});

describe("attemptHasAnsweredResponses", () => {
  it("is false when the attempt has no response entries at all", () => {
    const responsesByAttemptId = new Map<
      string,
      Map<string, ResponseLookupRow>
    >();
    expect(attemptHasAnsweredResponses("a1", responsesByAttemptId)).toBe(false);
  });

  it("is false when every response is unanswered", () => {
    const responsesByAttemptId = new Map([
      ["a1", new Map([["q1", responseRow("not_applicable", null)]])],
    ]);
    expect(attemptHasAnsweredResponses("a1", responsesByAttemptId)).toBe(false);
  });

  it("is true when at least one response is answered or skipped", () => {
    const answered = new Map([
      ["a1", new Map([["q1", responseRow("answered")]])],
    ]);
    const skipped = new Map([
      ["a2", new Map([["q1", responseRow("skipped", null)]])],
    ]);
    expect(attemptHasAnsweredResponses("a1", answered)).toBe(true);
    expect(attemptHasAnsweredResponses("a2", skipped)).toBe(true);
  });
});

describe("attemptHasCurrentQuestionResponses", () => {
  it("falls back to attemptHasAnsweredResponses when there are no current question keys", () => {
    const responsesByAttemptId = new Map([
      ["a1", new Map([["stale-key", responseRow("answered")]])],
    ]);
    // No question keys to check against — this is the documented fallback,
    // not "no keys means nothing can be answered".
    expect(
      attemptHasCurrentQuestionResponses("a1", [], responsesByAttemptId),
    ).toBe(true);
  });

  it("ignores an answered response under a stale key not in the current schema", () => {
    const responsesByAttemptId = new Map([
      ["a1", new Map([["stale-key", responseRow("answered")]])],
    ]);
    expect(
      attemptHasCurrentQuestionResponses(
        "a1",
        ["current-key"],
        responsesByAttemptId,
      ),
    ).toBe(false);
  });

  it("is true when a current key is answered or skipped", () => {
    const responsesByAttemptId = new Map([
      ["a1", new Map([["current-key", responseRow("skipped", null)]])],
    ]);
    expect(
      attemptHasCurrentQuestionResponses(
        "a1",
        ["current-key"],
        responsesByAttemptId,
      ),
    ).toBe(true);
  });
});

describe("resolveReadResponseAttemptId", () => {
  it("returns the start attempt when it already has current-key responses", () => {
    const attemptsById = new Map([["a1", attemptRow("a1")]]);
    const responsesByAttemptId = new Map([
      ["a1", new Map([["q1", responseRow("answered")]])],
    ]);
    expect(
      resolveReadResponseAttemptId(
        "a1",
        ["q1"],
        attemptsById,
        responsesByAttemptId,
      ),
    ).toBe("a1");
  });

  it("walks based_on to find the nearest attempt with usable responses", () => {
    // a3 (empty retry) -> a2 (empty retry) -> a1 (has the answer)
    const attemptsById = new Map([
      ["a1", attemptRow("a1")],
      ["a2", attemptRow("a2", { based_on_attempt_id: "a1" })],
      ["a3", attemptRow("a3", { based_on_attempt_id: "a2" })],
    ]);
    const responsesByAttemptId = new Map([
      ["a1", new Map([["q1", responseRow("answered")]])],
    ]);
    expect(
      resolveReadResponseAttemptId(
        "a3",
        ["q1"],
        attemptsById,
        responsesByAttemptId,
      ),
    ).toBe("a1");
  });

  it("returns the start attempt unchanged when nothing in the chain has answers", () => {
    const attemptsById = new Map([
      ["a1", attemptRow("a1")],
      ["a2", attemptRow("a2", { based_on_attempt_id: "a1" })],
    ]);
    const responsesByAttemptId = new Map<
      string,
      Map<string, ResponseLookupRow>
    >();
    expect(
      resolveReadResponseAttemptId(
        "a2",
        ["q1"],
        attemptsById,
        responsesByAttemptId,
      ),
    ).toBe("a2");
  });

  it("does not loop forever on a based_on cycle", () => {
    // Defensive only — based_on_attempt_id chains should never actually
    // cycle, but the walk must still terminate if data is ever corrupt.
    const attemptsById = new Map([
      ["a1", attemptRow("a1", { based_on_attempt_id: "a2" })],
      ["a2", attemptRow("a2", { based_on_attempt_id: "a1" })],
    ]);
    const responsesByAttemptId = new Map<
      string,
      Map<string, ResponseLookupRow>
    >();
    expect(
      resolveReadResponseAttemptId(
        "a1",
        ["q1"],
        attemptsById,
        responsesByAttemptId,
      ),
    ).toBe("a1");
  });

  it("returns null when the start attempt id is null", () => {
    const attemptsById = new Map<string, AttemptRow>();
    const responsesByAttemptId = new Map<
      string,
      Map<string, ResponseLookupRow>
    >();
    expect(
      resolveReadResponseAttemptId(
        null,
        ["q1"],
        attemptsById,
        responsesByAttemptId,
      ),
    ).toBeNull();
  });
});

describe("buildInterviewGateStatus", () => {
  function prepDoc(
    interviewCount: number | null,
    documentKind: "interview_transcript" | "other" = "interview_transcript",
  ) {
    return {
      id: "doc-1",
      filename: "interview.md",
      contentType: "text/markdown",
      sizeBytes: 100,
      documentKind,
      interviewCount,
      uploadedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("gate is not met at count 4 (below MINIMUM_CONFIRMED_INTERVIEWS = 5)", () => {
    const status = buildInterviewGateStatus([prepDoc(4)]);
    expect(status).toEqual({
      confirmedInterviewCount: 4,
      minimumRequired: 5,
      gateMet: false,
    });
  });

  it("gate is met exactly at count 5", () => {
    const status = buildInterviewGateStatus([prepDoc(2), prepDoc(3)]);
    expect(status).toEqual({
      confirmedInterviewCount: 5,
      minimumRequired: 5,
      gateMet: true,
    });
  });

  it("gate stays met above the minimum, at count 6", () => {
    const status = buildInterviewGateStatus([prepDoc(6)]);
    expect(status).toEqual({
      confirmedInterviewCount: 6,
      minimumRequired: 5,
      gateMet: true,
    });
  });

  it("ignores documents whose kind is not interview_transcript", () => {
    const status = buildInterviewGateStatus([prepDoc(5), prepDoc(10, "other")]);
    expect(status.confirmedInterviewCount).toBe(5);
  });

  it("treats a null interviewCount as zero", () => {
    const status = buildInterviewGateStatus([prepDoc(null)]);
    expect(status.confirmedInterviewCount).toBe(0);
    expect(status.gateMet).toBe(false);
  });
});
