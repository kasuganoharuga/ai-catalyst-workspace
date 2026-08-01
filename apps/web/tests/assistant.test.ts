import { describe, expect, it } from "vitest";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

import {
  ASSISTANT_CHOICES,
  DEFAULT_AI_PROVIDER,
  resolveAssistant,
} from "@/app/(app)/lib/assistant";
import { STEP_ILLUSTRATION_KEYS } from "@/app/(app)/lib/copy";

// Mirrors the user_profiles.preferred_ai_provider check constraint. Adding
// a provider to that constraint without adding it here should fail the
// exhaustiveness assertion below rather than 500 at render time.
const PROVIDERS: PreferredAiProvider[] = ["claude", "openai"];

describe("resolveAssistant", () => {
  it("resolves every provider the profile column can hold", () => {
    for (const provider of PROVIDERS) {
      expect(resolveAssistant(provider).provider, provider).toBe(provider);
    }
  });

  // The first-run dialog renders over pages that still have to resolve
  // something, so a null preference must not blow up.
  it("falls back to the default for a founder who hasn't chosen", () => {
    expect(resolveAssistant(null).provider).toBe(DEFAULT_AI_PROVIDER);
    expect(resolveAssistant(undefined).provider).toBe(DEFAULT_AI_PROVIDER);
  });

  it("offers both assistants in the dialog, once each", () => {
    expect(ASSISTANT_CHOICES.map((a) => a.provider).sort()).toEqual(
      [...PROVIDERS].sort(),
    );
  });

  // "openai" is a wire value from the check constraint. A founder reading
  // it on screen would have no idea what it meant.
  it("never uses the provider enum as a display name", () => {
    for (const provider of PROVIDERS) {
      const assistant = resolveAssistant(provider);
      expect(assistant.name, provider).not.toBe(provider);
      expect(assistant.name.length, provider).toBeGreaterThan(0);
    }
    expect(resolveAssistant("openai").name).toBe("ChatGPT");
    expect(resolveAssistant("claude").name).toBe("Claude");
  });
});

describe("assistant links", () => {
  it("gives every assistant a settings deep link and an app link", () => {
    for (const assistant of ASSISTANT_CHOICES) {
      expect(assistant.settingsDesktopUrl, assistant.name).toMatch(/^\w+:\/\//);
      expect(assistant.openAppUrl, assistant.name).toMatch(/^\w+:\/\//);
    }
  });

  // The deep link stops at the settings window; the Plugins page and the
  // MCPs tab inside it have no addressable route, and nothing in the
  // browser can reach them at all.
  it("has no browser fallback for ChatGPT", () => {
    const chatgpt = resolveAssistant("openai");
    expect(chatgpt.settingsDesktopUrl).toBe("codex://settings");
    expect(chatgpt.settingsWebUrl).toBeNull();
  });

  it("keeps Claude's browser fallback", () => {
    const claude = resolveAssistant("claude");
    expect(claude.settingsWebUrl).toContain("https://");
    expect(claude.webChatUrl).not.toBeNull();
  });

  // The hand-off picks its shape from these two being null, so a
  // half-filled record would render a button that silently does nothing.
  it("pairs the chat builders with the shape they imply", () => {
    for (const assistant of ASSISTANT_CHOICES) {
      if (assistant.desktopChatUrl === null) continue;
      expect(assistant.desktopChatUrl("hello"), assistant.name).toContain(
        encodeURIComponent("hello"),
      );
    }
  });
});

describe("connection steps", () => {
  it("asks for the workspace address exactly once per assistant", () => {
    for (const assistant of ASSISTANT_CHOICES) {
      const withAddress = assistant.copy.manualSteps.filter(
        (step) => step.showAddress,
      );
      expect(withAddress.length, assistant.name).toBe(1);
    }
  });

  // More than one link out and a founder has two places to start from.
  it("links out from at most one step per assistant", () => {
    for (const assistant of ASSISTANT_CHOICES) {
      const withLink = assistant.copy.manualSteps.filter(
        (step) => step.linkLabel,
      );
      expect(withLink.length, assistant.name).toBeLessThanOrEqual(1);
    }
  });

  it("only names an illustration the registry can render", () => {
    for (const assistant of ASSISTANT_CHOICES) {
      for (const step of assistant.copy.manualSteps) {
        if (!step.illustration) continue;
        expect(
          STEP_ILLUSTRATION_KEYS,
          `${assistant.name}: ${step.title}`,
        ).toContain(step.illustration);
      }
    }
  });

  // ConnectionSetupStep renders the fallback line from these two strings.
  // Carrying them on an assistant with no settingsWebUrl would produce a
  // link to nowhere.
  it("only carries fallback wording where there is somewhere to fall back to", () => {
    for (const assistant of ASSISTANT_CHOICES) {
      if (assistant.settingsWebUrl) continue;
      expect(
        assistant.copy.settingsFallbackLink,
        assistant.name,
      ).toBeUndefined();
      expect(
        assistant.copy.settingsFallbackPrefix,
        assistant.name,
      ).toBeUndefined();
    }
  });

  it("gives every assistant something to say when a step goes wrong", () => {
    for (const assistant of ASSISTANT_CHOICES) {
      expect(
        assistant.copy.troubleshooting.length,
        assistant.name,
      ).toBeGreaterThan(0);
    }
  });
});
