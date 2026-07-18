// Renders Module 0's `Founder-Toolkit-Setup-Summary.md` — a pure,
// DB/Storage-free function (same "pure function" convention as the
// Validators in artifact/internal/validators) so it can be unit-tested
// without a database. Mirrors the structure of
// content-seed/content/module-0.ts's own SETUP_SUMMARY_TEMPLATE (kept as
// a plain literal here rather than parsed from that stored template
// string — there is exactly one caller, and hand-written Markdown is far
// less fragile than templating a "- Label:" bullet list at runtime).
//
// Deliberately does NOT try to embed this document's own content SHA-256
// or version number in its own body — StorageService only knows a
// version's checksum/version_number after saveArtifactSubmission has
// already stored the exact bytes being described, so any value written
// here would necessarily describe a *different* set of bytes than what
// actually gets saved. The "Platform Storage" section instead states the
// verification outcome in words: source doc §0.5's Setup Summary is
// informational (validator_key is null; nothing gates on its content),
// not a business artefact whose own hash needs to be self-referenced.

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

export function renderSetupSummaryMarkdown(input: SetupSummaryRenderInput): string {
  const storageStatusLine = input.storageVerified
    ? "Verified — write, read-back, and hash checks all passed"
    : "Repair required — see the Founder Toolkit setup page";
  const moduleZeroStatusLine = input.storageVerified ? "Completed" : "Repair required";
  const nextModuleLine = input.nextModuleTitle ?? "None — this is the last Module in the Program";

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
