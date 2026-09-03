// Founder-facing copy: onboarding, connection, modules, workspace, profile, errors.
// Australian English: program, artefact, authorise (-ise). OAuth wire values stay as the spec spells them.
// Module titles, subtitles, and question texts live in the DB (content-seed), not here.
//
// Naming an assistant: only two surfaces do it — the connection page (it is
// a walkthrough of one specific product's settings) and the hand-off (it
// opens one specific app). Those live in `assistantCopy`, keyed by provider.
// Everything else in this file is neutral on purpose and says "AI" or "your
// AI assistant"; copy.test.ts enforces that.

// This barrel is the permanent public surface for this directory, not a
// transitional shim — the 70+ files that `import { x } from "…/lib/copy"`
// resolve here via Node/Next's directory-import rule and are meant to keep
// doing so indefinitely. New code may import a sibling module below
// directly (e.g. "…/lib/copy/mentor"); existing call sites don't need to
// move.
export * from "./connection";
export * from "./assistant";
export * from "./dashboard";
export * from "./module-brief";
export * from "./module-run";
export * from "./module";
export * from "./workspace";
export * from "./errors";
export * from "./mentor";
