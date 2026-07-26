import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { claudeChatUrl, claudeDesktopChatUrl } from "../lib/module-display";
import { claudeHandoffCopy } from "../lib/copy";
import { CopyButton } from "./copy-button";

/**
 * The single way this app hands a Founder over to Claude: the starter
 * message, a button that opens the desktop app with it already typed, and
 * a browser fallback.
 *
 * There used to be two shapes of this — one per module — that branched on
 * whether a Claude Project was linked. With a Project id saved, the button
 * switched to `claude://claude.ai/project/<id>`, and that URL form cannot
 * carry a prompt, so the Founder had to copy the line and paste it by hand.
 * The hand-off is now always a new chat with the prompt in it, and the
 * Copy button is a fallback rather than a required step.
 *
 * The fallback line is phrased as a symptom ("Nothing happened?") on
 * purpose. A `claude://` link on a machine without the desktop app does
 * nothing at all: no error, no new tab, no navigation. Offering "open in
 * browser" as a neutral alternative leaves the founder who just clicked
 * into silence with no idea that the silence is the failure mode.
 */
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
          {/* White text only when an accent colour is supplied. The module
              accents are saturated hues that need it; the default variant
              is bright lime, where its own dark `text-primary-foreground`
              is the readable pairing and white is close to invisible. */}
          <Button
            asChild
            size="lg"
            className={cn(
              "w-full",
              accent && "text-white hover:brightness-110",
            )}
            style={accent}
          >
            {/* No target="_blank": a claude:// link must stay in this tab, or
                a blocked handler leaves an orphaned blank tab behind. */}
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
