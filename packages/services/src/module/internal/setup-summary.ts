// --- Module 0 setup summary ---
// Pure Markdown renderer for unit tests — mirrors module-0.ts template shape
// as a literal (one caller). No self SHA-256; bytes unknown until after save.

export interface SetupSummaryRenderInput {
  workspaceName: string;
  ventureName: string;
  programRunLabel: string;
  branchName: string;
  aiClientLabel: string;
  checkedAtIso: string;
  storageVerified: boolean;
  nextModuleTitle: string | null;
}

export function renderSetupSummaryMarkdown(
  input: SetupSummaryRenderInput,
): string {
  const storageStatusLine = input.storageVerified
    ? "Verified — write, read-back, and hash checks all passed"
    : "Repair required — see the Founder Toolkit setup page";
  const moduleZeroStatusLine = input.storageVerified
    ? "Completed"
    : "Repair required";
  const nextModuleLine =
    input.nextModuleTitle ?? "None — this is the last Module in the Program";

  return `# Founder Toolkit Setup Summary

## Founder Context
- Workspace: ${input.workspaceName}
- Venture: ${input.ventureName}
- Program Run: ${input.programRunLabel}
- Active Branch: ${input.branchName}

## Connection
- AI client: ${input.aiClientLabel}
- Remote MCP: Connected
- OAuth status: Valid
- Last checked at: ${input.checkedAtIso}

## Platform Storage
- Storage status: ${storageStatusLine}
- Artefact version: Recorded in this submission's own metadata
- Verification status: ${input.storageVerified ? "Passed" : "Failed"}
- Content SHA-256: Computed and verified by StorageService on save

## Module Status
- Module 0: ${moduleZeroStatusLine}
- Next available module: ${nextModuleLine}

## Notes
- None
`;
}
