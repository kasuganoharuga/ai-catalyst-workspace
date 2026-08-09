import {
  escapeHtml,
  wrapPrintableDocumentHtml,
} from "@ai-catalyst/services/artifact/internal/renderers/html/markdown-document-html";
import {
  parseValidationRoadmap,
  type Experiment,
  type ValidationRoadmapModel,
} from "@ai-catalyst/services/artifact/internal/renderers/parse/validation-roadmap";

function paragraphHtml(text: string): string {
  const escaped = escapeHtml(text).replace(/\n+/g, "</p><p>");
  return `<p>${escaped}</p>`;
}

function dlRow(label: string, value: string): string {
  return `<div class="experiment-row">
  <dt>${escapeHtml(label)}</dt>
  <dd>${escapeHtml(value)}</dd>
</div>`;
}

function experimentCardHtml(experiment: Experiment, index: number): string {
  return `<article class="experiment-card">
  <h3>Experiment ${index + 1} — ${escapeHtml(experiment.name)}</h3>
  <dl>
    ${dlRow("Claim tested", experiment.claimTested)}
    ${dlRow("Pass condition", experiment.passCondition)}
    ${dlRow("Fail condition", experiment.failCondition)}
    ${dlRow("Time", experiment.time)}
    ${dlRow("Cost", experiment.cost)}
    ${dlRow("Expected evidence signal strength", String(experiment.signalStrength))}
    ${dlRow("30-day window", experiment.window)}
  </dl>
</article>`;
}

function bodyFromModel(model: ValidationRoadmapModel): string {
  const anchors = model.signalStrengthAnchors
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("\n");

  const experimentCards = model.experiments
    .map((experiment, index) => experimentCardHtml(experiment, index))
    .join("\n");

  return `<h1>30-Day Validation Roadmap</h1>

<section>
  <h2>Venture</h2>
  <p><strong>Venture name:</strong> ${escapeHtml(model.ventureName)}</p>
</section>

<section>
  <h2>Constraints</h2>
  <p><strong>Time available:</strong> ${escapeHtml(model.constraints.timeAvailable)}</p>
  <p><strong>Budget:</strong> ${escapeHtml(model.constraints.budget)}</p>
  <p><strong>Customer access:</strong> ${escapeHtml(model.constraints.customerAccess)}</p>
</section>

<section>
  <h2>What These Experiments Test</h2>
  ${paragraphHtml(model.whatTheseExperimentsTest)}
</section>

<section>
  <h2>Experiments</h2>
  ${experimentCards}
  <h3>Expected evidence signal strength</h3>
  <ul>
    ${anchors}
  </ul>
</section>

<section>
  <h2>Start Here</h2>
  <p><strong>What to do:</strong> ${escapeHtml(model.startHere.whatToDo)}</p>
  <p><strong>Who to contact, and how:</strong> ${escapeHtml(model.startHere.whoToContact)}</p>
  <p><strong>What counts as a pass:</strong> ${escapeHtml(model.startHere.pass)}</p>
  <p><strong>What counts as a fail:</strong> ${escapeHtml(model.startHere.fail)}</p>
</section>

<section>
  <h2>How to Record Results</h2>
  ${paragraphHtml(model.howToRecordResults)}
</section>`;
}

const EXTRA_CSS = `
    .experiment-card {
      border: 1px solid #ccc;
      border-radius: 4pt;
      padding: 10pt 12pt;
      margin: 0 0 12pt;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .experiment-card h3 {
      margin: 0 0 8pt;
      padding: 0;
      border: 0;
    }
    .experiment-card dl {
      margin: 0;
    }
    .experiment-row {
      display: grid;
      grid-template-columns: 11rem 1fr;
      gap: 6pt 10pt;
      margin: 0 0 6pt;
      page-break-inside: avoid;
    }
    .experiment-row dt {
      font-weight: 650;
      color: #444;
    }
    .experiment-row dd {
      margin: 0;
    }
`;

/**
 * Printable 30-Day Validation Roadmap: stacked experiment cards instead of
 * the dense 8-column Markdown table (portrait A4). Source Markdown stays
 * tabular for the website preview and validators.
 */
export function buildValidationRoadmapHtml(input: {
  title: string;
  markdown: string;
  footerLabel: string;
}): string {
  const model = parseValidationRoadmap(input.markdown);
  return wrapPrintableDocumentHtml({
    title: input.title,
    bodyHtml: bodyFromModel(model),
    footerLabel: input.footerLabel,
    extraCss: EXTRA_CSS,
  });
}
