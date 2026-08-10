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

// Composes copy.ts strings and module-display.ts URL builders — one import for call sites.
// Assistants are not symmetrical (nullable fields force explicit handling).

export interface Assistant {
  provider: PreferredAiProvider;
  /** Founder-facing product name — never render the provider enum. */
  name: string;
  copy: AssistantCopy;
  /** Deep link into connector/server settings. */
  settingsDesktopUrl: string;
  /** Browser settings URL, or null when none exists. */
  settingsWebUrl: string | null;
  /** Prefilled desktop chat, or null when unsupported. */
  desktopChatUrl: ((prompt: string) => string) | null;
  /** Prefilled web chat, or null when it would not work. */
  webChatUrl: ((prompt: string) => string) | null;
  /** Opens the app with nothing prefilled. */
  openAppUrl: string;
}

/** Default before first-run choice — only reached while onboarding dialog is open. */
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

/** Both assistants in first-run order — Claude first (works without desktop app). */
export const ASSISTANT_CHOICES: Assistant[] = [
  ASSISTANTS.claude,
  ASSISTANTS.openai,
];
