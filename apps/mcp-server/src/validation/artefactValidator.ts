import type { ModuleDefinition } from "../modules/moduleDefinitions.js";

export type ArtefactValidationResult = {
  missing: string[];
};

const HEADING_PATTERN = /^##\s+(.+?)\s*$/;
const BULLET_LINE_PATTERN = /^\s*(?:[-*+]|\d+[.)])\s+\S/;

function normalizeHeading(raw: string): string {
  return raw
    .replace(/^[\d]+[.)]\s*/, "")
    .trim()
    .toLowerCase();
}

/** Parses "## Heading" (h2) sections out of a Markdown artefact into normalized-heading -> body text. */
function parseSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  let currentHeading: string | undefined;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentHeading !== undefined) {
      sections.set(currentHeading, currentBody.join("\n").trim());
    }
  };

  for (const line of lines) {
    const match = HEADING_PATTERN.exec(line);
    if (match) {
      flush();
      currentHeading = normalizeHeading(match[1] ?? "");
      currentBody = [];
    } else if (currentHeading !== undefined) {
      currentBody.push(line);
    }
  }
  flush();

  return sections;
}

export function validateArtefactContent(content: string, definition: ModuleDefinition): ArtefactValidationResult {
  const sections = parseSections(content);
  const missing: string[] = [];

  for (const requiredSection of definition.requiredSections) {
    const body = sections.get(normalizeHeading(requiredSection));
    if (body === undefined || body.length === 0) {
      missing.push(requiredSection);
    }
  }

  const verdictBody = sections.get(normalizeHeading("Verdict"));
  if (verdictBody && !missing.includes("Verdict")) {
    const hasDecisionKeyword = definition.verdictDecisionKeywords.some((keyword) =>
      new RegExp(`\\b${keyword}\\b`, "i").test(verdictBody),
    );
    if (!hasDecisionKeyword) {
      missing.push(`Verdict (missing a ${definition.verdictDecisionKeywords.join("/")} decision)`);
    }
  }

  const nextActionsBody = sections.get(normalizeHeading("Next Actions"));
  if (nextActionsBody && !missing.includes("Next Actions")) {
    const hasBullet = nextActionsBody.split(/\r?\n/).some((line) => BULLET_LINE_PATTERN.test(line));
    if (!hasBullet) {
      missing.push("Next Actions (no action items listed)");
    }
  }

  return { missing };
}
