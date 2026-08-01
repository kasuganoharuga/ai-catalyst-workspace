import { ExternalLink } from "lucide-react";

import type { PreferredAiProvider } from "@ai-catalyst/shared";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveAssistant } from "../lib/assistant";
import { handoffCopy } from "../lib/copy";
import { CopyButton } from "./copy-button";

/**
 * Hand-off to the founder's chosen assistant.
 *
 * Two shapes, chosen by whether `assistant.desktopChatUrl` is set rather
 * than by a provider check here:
 *
 * - **Deep link** (both assistants currently): the button opens a chat
 *   with the message already in it. Claude additionally gets a browser
 *   link underneath, for when the desktop app isn't installed and the
 *   custom scheme silently no-ops — ChatGPT has none, because a chat at
 *   chatgpt.com has no route to this workspace's MCP connector regardless
 *   of whether the desktop app exists.
 * - **Copy first** (unused today, kept working): if an assistant's
 *   `desktopChatUrl` were ever null again — no verified scheme for a
 *   prefilled chat — copying becomes the primary action and opening the
 *   bare app secondary. This is what a wrong or since-changed URL scheme
 *   degrades to, not a dead branch.
 */
export function AssistantHandoff({
  provider,
  prompt,
  retry = false,
  accent,
  disabled = false,
  disabledNote,
}: {
  provider: PreferredAiProvider | null;
  prompt: string;
  /** Swaps the calls to action for their "you've been here before" wording. */
  retry?: boolean;
  /** The module's identity colour, applied to the primary button. */
  accent?: { backgroundColor: string };
  /** Locked modules show the prompt for context but must not open anything. */
  disabled?: boolean;
  disabledNote?: string;
}) {
  const assistant = resolveAssistant(provider);
  const { handoff } = assistant.copy;
  const desktopChatUrl = assistant.desktopChatUrl;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {handoffCopy.promptLabel}
        </p>
        {!disabled ? (
          <CopyButton value={prompt} label={handoffCopy.copyLabel} />
        ) : null}
      </div>

      <p className="px-4 py-4 font-mono text-sm leading-6 text-foreground">
        {prompt}
      </p>

      {disabled ? (
        <p className="border-t border-border px-4 py-4 text-sm leading-6 text-muted-foreground">
          {disabledNote}
        </p>
      ) : (
        <div className="border-t border-border px-4 py-4">
          {desktopChatUrl ? (
            <>
              {/* White text on module accent; default lime uses text-primary-foreground */}
              <Button
                asChild
                size="lg"
                className={cn(
                  "w-full",
                  accent && "text-white hover:brightness-110",
                )}
                style={accent}
              >
                {/* No target="_blank" — a custom scheme must stay in this tab */}
                <a href={desktopChatUrl(prompt)}>
                  {retry ? handoff.retryCta : handoff.openCta}
                  <ExternalLink aria-hidden="true" />
                </a>
              </Button>
              <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
                {handoff.hint}
                {assistant.webChatUrl && handoff.fallbackLink ? (
                  <>
                    <br />
                    {handoff.fallbackPrefix}{" "}
                    <a
                      href={assistant.webChatUrl(prompt)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {handoff.fallbackLink}
                    </a>
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <>
              {/* Copying is the action that actually gets the founder
                  moving here, so it takes the primary button rather than
                  sitting as a small control in the header above. */}
              <CopyButton
                value={prompt}
                label={retry ? handoffCopy.copyRetryCta : handoffCopy.copyCta}
                size="lg"
                className={cn(
                  "w-full",
                  accent && "text-white hover:brightness-110",
                )}
                style={accent}
              />
              <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
                {handoff.hint}
                <br />
                <a
                  href={assistant.openAppUrl}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {handoff.openCta}
                </a>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
