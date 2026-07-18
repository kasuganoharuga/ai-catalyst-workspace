import Link from "next/link";

import { cn } from "@/lib/utils";

import { CopyButton } from "../../../components/copy-button";

/**
 * Module 0's "how this works" walkthrough (design frame H4, translated
 * from the Skill-download flow to the MCP one). Module 0 doubles as the
 * Founder's first lesson in working through Claude — so this card teaches
 * the pattern every later module reuses: connect once, then just talk.
 */
export function Module0Guide({
  connected,
  startPrompt,
}: {
  connected: boolean;
  startPrompt: string;
}) {
  return (
    <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm lg:p-8">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        How this works
      </h2>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        Module 0 is a five-minute warm-up with one job: prove the whole path
        works — you, Claude, and your workspace — before any real thinking
        starts. It&apos;s also your practice run at how every module works from
        here on: nothing to download, nothing to fill in. You talk, Claude does
        the rest.
      </p>

      <ol className="mt-8 space-y-6">
        <li className="flex gap-4">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold",
              connected
                ? "bg-accent text-accent-foreground"
                : "bg-surface-inverse text-brand-lime",
            )}
          >
            {connected ? "✓" : "1"}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Connect Claude to your workspace
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {connected ? (
                "Done — Claude is connected."
              ) : (
                <>
                  A one-time setup, about two minutes.{" "}
                  <Link
                    href="/connection"
                    className="font-semibold text-foreground underline underline-offset-4"
                  >
                    Start here
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        </li>
        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-inverse font-mono text-xs font-bold text-brand-lime">
            2
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Open a new chat and ask Claude to start
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="min-w-0 rounded-xl bg-muted px-4 py-2.5 font-mono text-xs leading-5 text-foreground">
                {startPrompt}
              </code>
              <CopyButton value={startPrompt} label="Copy" />
            </div>
          </div>
        </li>
        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-inverse font-mono text-xs font-bold text-brand-lime">
            3
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Claude checks the whole path for you
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Your login, your venture, and that it can save and read back files
              in your workspace storage. You&apos;ll see each check happen right
              in the chat.
            </p>
          </div>
        </li>
        <li className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-inverse font-mono text-xs font-bold text-brand-lime">
            4
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              The Setup Summary saves itself — and Module 1 unlocks
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Once everything passes, a summary document lands in your workspace
              automatically and Module 0 marks itself complete. No confirm
              button, nothing to upload.
            </p>
          </div>
        </li>
      </ol>

      <div className="mt-8 rounded-2xl bg-muted/60 px-5 py-4">
        <p className="text-sm leading-6 text-muted-foreground">
          <span className="font-semibold text-foreground">
            Why bother with a check module?
          </span>{" "}
          So Module 1 — the one that actually challenges your idea — never
          stumbles on plumbing. Five minutes here buys you a smooth run
          everywhere else.
        </p>
      </div>
    </div>
  );
}
