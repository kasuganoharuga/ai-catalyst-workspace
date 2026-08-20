// Verb phrases completing "This will allow {client} to …". Match every
// `assistantCopy[…].privacyBody` in app/(app)/lib/copy.ts — this screen and
// the connection page describe the same grant and must not disagree.
// Unmapped scopes show raw — that means the authorize hook changed without
// this list.
export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "mcp:connect":
    "Read your module questions, save your answers, and store the documents you produce.",
  offline_access:
    "Stay connected between sessions, so you don't have to reconnect every hour.",
};
