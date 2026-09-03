/** Opens a fresh Claude chat with a prefilled starter message. */
export function claudeChatUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/**
 * Desktop deep link to a Claude Chat Project. Cannot combine project + prompt —
 * use claudeChatProjectWebUrl when both are needed.
 */
export function claudeChatProjectUrl(projectId: string): string {
  return `claude://claude.ai/project/${projectId}`;
}

/** Browser URL into a Claude Chat Project. Optional prompt builds /new?project=…&q=…. */
export function claudeChatProjectWebUrl(
  projectId: string,
  prompt?: string,
): string {
  if (prompt) {
    return `https://claude.ai/new?project=${encodeURIComponent(projectId)}&q=${encodeURIComponent(prompt)}`;
  }
  return `https://claude.ai/project/${projectId}`;
}

// /customize/connectors — not /settings/connectors; no menu route in copy (UI moves break it).
export const CLAUDE_CONNECTOR_SETTINGS_DESKTOP_URL =
  "claude://claude.ai/customize/connectors";

export const CLAUDE_CONNECTOR_SETTINGS_URL =
  "https://claude.ai/customize/connectors";

/** Opens Claude Desktop with a prefilled composer (claude://claude.ai/new?q=…). */
export function claudeDesktopChatUrl(prompt: string): string {
  return `claude://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

// ── ChatGPT ─────────────────────────────────────────────────────────────

/**
 * As far as this deep link goes. The scheme opens the settings window but
 * cannot address the Plugins page or the MCPs tab inside it, so the manual
 * steps carry the founder from there.
 */
export const CHATGPT_SETTINGS_DESKTOP_URL = "codex://settings";

/**
 * Opens the desktop app, nothing more. There is deliberately no browser
 * equivalent anywhere in the ChatGPT flow: the MCP server is registered in
 * the desktop app, so a chat at chatgpt.com cannot reach this workspace and
 * sending a founder there would produce an assistant that denies the
 * workspace exists.
 */
export const CHATGPT_APP_URL = "codex://";

/** Desktop prefilled composer (`codex://new?prompt=…`) — same "ready to send" contract as Claude; no browser fallback because chatgpt.com cannot reach this MCP connector. */
export function chatgptDesktopChatUrl(prompt: string): string {
  return `codex://new?prompt=${encodeURIComponent(prompt)}`;
}

export function startModulePrompt(moduleTitle: string): string {
  return [
    `Continue "${moduleTitle}" in my AI Catalyst Founder Toolkit.`,
    "Use the AI Catalyst MCP FIRST and treat it as the source of truth for my venture, run, module progress, answers, artifacts, and next step.",
    "Do NOT search the local workspace, task history, previous chats, or local files for AI Catalyst progress.",
    "Do NOT reconstruct or re-save answers from local chat history, task folders, or prior threads — only persist what Module context / MCP returns as current state.",
    "If MCP is unavailable, repair/reconnect it first. Then resume from the latest state stored in AI Catalyst.",
  ].join("\n");
}
