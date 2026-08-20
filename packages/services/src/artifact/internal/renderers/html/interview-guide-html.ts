import type { InterviewGuideModel } from "@ai-catalyst/services/artifact/internal/renderers/parse/interview-guide";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Printable Interview Guide — blank pen lines for field notes, questions
 * from the confirmed guide (or activity snapshot questions).
 */
export function buildInterviewGuideHtml(model: {
  ventureName: string;
  interviewTarget: string;
  whatThisInterviewTests: string;
  openingScript?: string;
  questions: string[];
  questionGuidance?: { listenFor: string[]; suggestion: string }[];
  passBar?: InterviewGuideModel["passBar"];
  killCriteria?: string[];
  assumptions?: InterviewGuideModel["assumptions"];
  closingQuestions?: string[];
}): string {
  const questionsHtml = model.questions
    .map((q, i) => {
      const guidance = model.questionGuidance?.[i];
      const guidanceHtml = guidance
        ? `
      <div class="guidance">
        <p class="guidance-label">Listen for:</p>
        <ul>${guidance.listenFor.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
        <p class="suggestion"><strong>Suggestion:</strong> ${escapeHtml(guidance.suggestion)}</p>
      </div>`
        : "";
      return `
    <section class="question">
      <h2>Q${i + 1}</h2>
      <p class="prompt">${escapeHtml(q)}</p>
      <div class="lines" aria-hidden="true">
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
        <div class="line"></div>
      </div>
      ${guidanceHtml}
    </section>`;
    })
    .join("\n");

  const openingScriptHtml = model.openingScript
    ? `<section class="box">
        <h2>Opening script</h2>
        <p>${escapeHtml(model.openingScript)}</p>
      </section>`
    : "";

  const passBarHtml = model.passBar
    ? `<section class="box">
        <h2>Pass bar</h2>
        <p>${escapeHtml(model.passBar.preamble)}</p>
        <ul>${model.passBar.conditions.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
      </section>`
    : "";

  const killHtml =
    model.killCriteria && model.killCriteria.length > 0
      ? `<section class="box">
        <h2>Kill criteria</h2>
        <ul>${model.killCriteria.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
      </section>`
      : "";

  const assumptionsHtml =
    model.assumptions && model.assumptions.length > 0
      ? `<section class="box">
        <h2>Assumptions being validated</h2>
        <table class="assumptions">
          <thead><tr><th>Assumption</th><th>Validated if…</th><th>Invalidated if…</th></tr></thead>
          <tbody>${model.assumptions
            .map(
              (a) =>
                `<tr><td>${escapeHtml(a.assumption)}</td><td>${escapeHtml(a.validatedIf)}</td><td>${escapeHtml(a.invalidatedIf)}</td></tr>`,
            )
            .join("")}</tbody>
        </table>
      </section>`
      : "";

  const closingQuestionsHtml =
    model.closingQuestions && model.closingQuestions.length > 0
      ? `<section class="box">
        <h2>Closing questions</h2>
        <ul>${model.closingQuestions.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
      </section>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Problem Interview Guide</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #1a1a1a;
      margin: 0;
    }
    h1 { font-size: 20pt; margin: 0 0 8pt; font-weight: 650; }
    h2 { font-size: 12pt; margin: 14pt 0 6pt; }
    .meta { margin: 0 0 14pt; }
    .meta dt { font-weight: 600; float: left; width: 9rem; clear: left; }
    .meta dd { margin: 0 0 4pt 9rem; min-height: 1.2em; border-bottom: 1px solid #bbb; }
    .question { break-inside: avoid; margin-bottom: 10pt; }
    .prompt { margin: 0 0 6pt; }
    .line {
      border-bottom: 1px solid #ccc;
      height: 16pt;
      margin-bottom: 2pt;
    }
    .box {
      break-inside: avoid;
      border: 1px solid #ccc;
      padding: 8pt 10pt;
      margin-top: 12pt;
    }
    .box ul { margin: 4pt 0 0 1.1rem; padding: 0; }
    .guidance {
      margin-top: 6pt;
      padding: 6pt 8pt;
      background: #f6f6f6;
      border-left: 3px solid #bbb;
    }
    .guidance-label { font-weight: 600; margin: 0 0 2pt; }
    .guidance ul { margin: 0 0 6pt 1.1rem; padding: 0; }
    .guidance .suggestion { margin: 0; }
    table.assumptions {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4pt;
      font-size: 10pt;
    }
    table.assumptions th, table.assumptions td {
      border: 1px solid #ccc;
      padding: 4pt 6pt;
      text-align: left;
      vertical-align: top;
    }
    footer {
      margin-top: 18pt;
      font-size: 9pt;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>Problem Interview Guide</h1>
  <p>Take this sheet to real customer conversations. Filling it in does not save evidence to AI Catalyst — record interviews on the website in Module 4.</p>
  <dl class="meta">
    <dt>Venture</dt><dd>${escapeHtml(model.ventureName) || "&nbsp;"}</dd>
    <dt>Interviewee</dt><dd>&nbsp;</dd>
    <dt>Company</dt><dd>&nbsp;</dd>
    <dt>Role</dt><dd>&nbsp;</dd>
    <dt>Date</dt><dd>&nbsp;</dd>
    <dt>Interview target</dt><dd>${escapeHtml(model.interviewTarget) || "&nbsp;"}</dd>
  </dl>
  ${openingScriptHtml}
  <section class="box">
    <h2>What this interview tests</h2>
    <p>${escapeHtml(model.whatThisInterviewTests) || "—"}</p>
  </section>
  ${questionsHtml}
  ${passBarHtml}
  ${killHtml}
  ${assumptionsHtml}
  ${closingQuestionsHtml}
  <footer>AI Catalyst · Problem Interview Guide</footer>
</body>
</html>`;
}
