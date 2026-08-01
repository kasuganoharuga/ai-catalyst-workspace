import type { PreferredAiProvider } from "@ai-catalyst/shared";

import type { AssistantCopy } from "./copy";
import { assistantCopy } from "./copy";
import {
  CHATGPT_APP_URL,
  CHATGPT_SETTINGS_DESKTOP_URL,
  CLAUDE_CONNECTOR_SETTINGS_DESKTOP_URL,
  CLAUDE_CONNECTOR_SETTINGS_URL,
  chatgptDesktopChatUrl,
  claudeChatUrl,
  claudeDesktopChatUrl,
} from "./module-display";

// Everything that differs between the assistants a founder can choose,
// resolved in one place. Strings stay in copy.ts and URL builders stay in
// module-display.ts; this only composes them, so a call site imports one
// thing instead of branching on the provider itself.
//
// The two assistants are not fully symmetrical and this type says so
// rather than papering over it: Claude's settings have a browser URL,
// ChatGPT's don't. Both now have a prefilled desktop composer. Fields stay
// nullable so a call site still has to decide what to do when one really
// is missing, rather than assuming both assistants always match Claude's
// shape.

export interface Assistant {
  provider: PreferredAiProvider;
  /** The founder-facing product name. Never render the provider enum. */
  name: string;
  copy: AssistantCopy;
  /** Deep link into the assistant's connector/server settings. */
  settingsDesktopUrl: string;
  /** Browser equivalent of the above, or null when there isn't one. */
  settingsWebUrl: string | null;
  /** Opens a new chat with the message prefilled, or null when unsupported. */
  desktopChatUrl: ((prompt: string) => string) | null;
  /** Browser equivalent of the above, or null when it would not work. */
  webChatUrl: ((prompt: string) => string) | null;
  /** Opens the app with nothing prefilled. Always present. */
  openAppUrl: string;
}

/**
 * What an account sees before it has chosen. Reached only by code paths
 * that run while the first-run dialog is still open, since every other
 * route has a stored choice by then.
 */
export const DEFAULT_AI_PROVIDER: PreferredAiProvider = "claude";

const ASSISTANTS: Record<PreferredAiProvider, Assistant> = {
  claude: {
    provider: "claude",
    name: assistantCopy.claude.name,
    copy: assistantCopy.claude,
    settingsDesktopUrl: CLAUDE_CONNECTOR_SETTINGS_DESKTOP_URL,
    settingsWebUrl: CLAUDE_CONNECTOR_SETTINGS_URL,
    desktopChatUrl: claudeDesktopChatUrl,
    webChatUrl: claudeChatUrl,
    openAppUrl: "claude://claude.ai/new",
  },
  openai: {
    provider: "openai",
    name: assistantCopy.openai.name,
    copy: assistantCopy.openai,
    settingsDesktopUrl: CHATGPT_SETTINGS_DESKTOP_URL,
    // No browser route to Plugins → MCPs — that part of the asymmetry
    // with Claude is real and stays. The hand-off itself is no longer
    // copy-first: chatgptDesktopChatUrl's doc comment has the sourcing for
    // why `codex://new?prompt=` is trusted the same way
    // CHATGPT_SETTINGS_DESKTOP_URL already was.
    settingsWebUrl: null,
    desktopChatUrl: chatgptDesktopChatUrl,
    webChatUrl: null,
    openAppUrl: CHATGPT_APP_URL,
  },
};

export function resolveAssistant(
  provider: PreferredAiProvider | null | undefined,
): Assistant {
  return ASSISTANTS[provider ?? DEFAULT_AI_PROVIDER];
}

/**
 * Both assistants, in the order the first-run dialog offers them.
 * Claude first because it is the one that works without a desktop app.
 */
export const ASSISTANT_CHOICES: Assistant[] = [
  ASSISTANTS.claude,
  ASSISTANTS.openai,
];
