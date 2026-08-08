import type {
  InterviewQuestionSnapshot,
  InterviewRecord,
} from "@ai-catalyst/services/interview/types";

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeBlock(text: string): string {
  return text.trim().length > 0 ? text.trim() : "—";
}

/**
 * Build Customer Interview Evidence markdown from completed records.
 * Includes HTML comments with record ids for machine provenance; human
 * body stays Founder-readable.
 */
export function buildInterviewEvidenceMarkdown(input: {
  questions: InterviewQuestionSnapshot[];
  records: InterviewRecord[];
  confirmedAtIso?: string | null;
}): string {
  const completed = input.records
    .filter((r) => r.status === "completed")
    .sort((a, b) => a.sequenceIndex - b.sequenceIndex);

  const lines: string[] = [
    "# Customer Interview Evidence",
    "",
    "Evidence recorded from customer interviews on the AI Catalyst website.",
    "",
  ];

  if (input.confirmedAtIso) {
    lines.push(`<!-- evidence_confirmed_at: ${input.confirmedAtIso} -->`, "");
  }

  lines.push(
    `<!-- source_record_ids: ${JSON.stringify(completed.map((r) => r.id))} -->`,
    "",
  );

  for (const record of completed) {
    lines.push(
      `## Interview ${record.sequenceIndex}`,
      "",
      `<!-- interview_record_id: ${record.id} -->`,
      "",
      `**Interviewee:** ${escapeBlock(record.intervieweeName)}`,
      `**Company:** ${escapeBlock(record.company)}`,
      `**Role:** ${escapeBlock(record.role)}`,
      `**Date:** ${formatDate(record.interviewedAt)}`,
      "",
    );

    for (const question of input.questions) {
      const answer = record.answers[String(question.index)] ?? "";
      lines.push(
        `### Q${question.index}`,
        "",
        question.text,
        "",
        "**Response:**",
        "",
        escapeBlock(answer),
        "",
      );
    }

    lines.push(
      "### Key Quote",
      "",
      record.keyQuote?.trim()
        ? `> ${record.keyQuote.trim().replace(/\n/g, "\n> ")}`
        : "—",
      "",
      "### Current Workaround",
      "",
      escapeBlock(record.currentWorkaround ?? ""),
      "",
      "---",
      "",
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
