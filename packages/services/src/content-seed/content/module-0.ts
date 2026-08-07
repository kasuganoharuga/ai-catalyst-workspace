import type { ModuleContent } from "../types.js";

const SETUP_SUMMARY_TEMPLATE = `# Founder Toolkit Setup Summary

## Founder Context
- Workspace:
- Venture:
- Program Run:
- Active Branch:

## Connection
- AI client:
- Remote MCP:
- OAuth status:
- Last checked at:

## Platform Storage
- Storage status:
- Artefact version:
- Verification status:
- Content SHA-256:

## Module Status
- Module 0:
- Next available module:

## Notes
- None
`;

// module_type='setup' / completion_mode='system': no module_questions, no
// business verdict — the system completes this Module automatically once
// validation passes.
export const MODULE_0_CONTENT: ModuleContent = {
  moduleKey: "module-00-setup",
  sequenceIndex: 0,
  title: "Setup and Connection",
  subtitle:
    "Confirm the Toolkit works end to end before starting substantive work",
  description:
    "Confirms the authenticated Founder, authorised Workspace, active Venture, Remote MCP connection, and platform storage read/write before Module 1 begins. Does not connect Google Drive, does not ask pressure-test questions, and does not produce a business verdict.",
  objective:
    "Confirm that the Founder can use the Toolkit end to end before starting substantive work.",
  moduleType: "setup",
  isRequired: true,
  allowRevisions: false,
  completionMode: "system",
  estimatedMinutes: 5,
  isPublishable: true,
  questions: [],
  artifacts: [
    {
      artifactKey: "setup_summary",
      sequenceIndex: 1,
      name: "Founder Toolkit Setup Summary",
      description:
        "System-generated confirmation that the AI client, Remote MCP, and platform storage are connected and verified for the active Venture.",
      isRequired: true,
      artifactType: "document",
      sourceFormat: "markdown",
      outputFormat: "markdown",
      requiredFilename: "Founder-Toolkit-Setup-Summary.md",
      rendererKey: null,
      validatorKey: null,
      allowedMimeTypes: ["text/markdown", "text/plain"],
      maxFileSizeBytes: 262_144,
      maxFiles: 1,
      // No content-quality draft check for Module 0 — completion is
      // determined by operational checks (auth, MCP, storage read/write/
      // hash), not by evaluating the Markdown's content.
      validationConfig: {},
      outputConfig: {
        schemaVersion: 1,
        templateFormat: "markdown",
        templateMarkdown: SETUP_SUMMARY_TEMPLATE,
      },
    },
  ],
};
