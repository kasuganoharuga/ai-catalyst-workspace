"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { setPreferredAiProviderAction } from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

import { ASSISTANT_CHOICES } from "../../lib/assistant";
import { errorCopy, onboardingCopy } from "../../lib/copy";
import { AssistantMark } from "../assistant-mark";

/**
 * The only required step. Nothing is preselected: a highlighted default
 * would be answered by pressing the button, and the whole point is that
 * this is a decision rather than a formality.
 */
export function AssistantStep({ onDone }: { onDone: () => void }) {
  const [chosen, setChosen] = useState<PreferredAiProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen) return;

    setSaving(true);
    setError(null);

    try {
      const result = await setPreferredAiProviderAction(chosen);
      if (!result.ok) {
        setError(result.message);
        setSaving(false);
        return;
      }
      onDone();
    } catch {
      setError(errorCopy.generic);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{onboardingCopy.assistantTitle}</legend>
        {ASSISTANT_CHOICES.map((assistant) => {
          const selected = chosen === assistant.provider;
          return (
            <label
              key={assistant.provider}
              className={cn(
                "relative cursor-pointer rounded-lg border p-4 transition",
                selected
                  ? "border-brand-lime bg-brand-lime/10"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <input
                type="radio"
                name="assistant"
                value={assistant.provider}
                checked={selected}
                onChange={() => setChosen(assistant.provider)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <AssistantMark
                    provider={assistant.provider}
                    className="h-4 w-4 shrink-0"
                  />
                  {assistant.name}
                </span>
                {selected ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-lime">
                    <Check
                      aria-hidden="true"
                      className="h-2.5 w-2.5 text-brand-lime-foreground"
                      strokeWidth={3}
                    />
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </fieldset>

      <p className="text-sm leading-6 text-muted-foreground">
        {onboardingCopy.assistantPlatformNote}
      </p>

      {error ? (
        <p
          role="alert"
          className="border-l-2 border-destructive bg-destructive/5 py-2 pl-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* No skip here — see the header comment on OnboardingDialog. */}
      <Button type="submit" disabled={!chosen || saving}>
        {saving ? onboardingCopy.assistantPending : onboardingCopy.assistantCta}
      </Button>
    </form>
  );
}
