import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { claudeChatUrl, claudeDesktopChatUrl } from "../lib/module-display";
import { claudeHandoffCopy } from "../lib/copy";
import { CopyButton } from "./copy-button";

/** Hand-off to Claude: prefilled desktop link + browser fallback (symptom phrasing if claude:// fails). */
export function ClaudeHandoff({
  prompt,
  label,
  accent,
  disabled = false,
  disabledNote,
}: {
  prompt: string;
  /** Defaults to "Continue in Claude"; pass the retry label when retrying. */
  label?: string;
  /** The module's identity colour, applied to the primary button. */
  accent?: { backgroundColor: string };
  /** Locked modules show the prompt for context but must not open Claude. */
  disabled?: boolean;
  disabledNote?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {claudeHandoffCopy.promptLabel}
        </p>
        {!disabled ? (
          <CopyButton value={prompt} label={claudeHandoffCopy.copyLabel} />
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
            {/* No target="_blank" — claude:// must stay in this tab */}
            <a href={claudeDesktopChatUrl(prompt)}>
              {label ?? claudeHandoffCopy.openCta}
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
            {claudeHandoffCopy.desktopHint}
            <br />
            {claudeHandoffCopy.browserFallbackPrefix}{" "}
            <a
              href={claudeChatUrl(prompt)}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {claudeHandoffCopy.browserFallbackLink}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
