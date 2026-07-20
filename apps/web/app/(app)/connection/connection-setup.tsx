"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CopyButton } from "../components/copy-button";
import { RecheckButton } from "../components/recheck-button";
import {
  CLAUDE_CONNECTOR_SETTINGS_URL,
  claudeChatUrl,
  claudeDesktopChatUrl,
  mcpConnectPrompt,
} from "../lib/module-display";

const OPTIONS = [
  { key: "ask", label: "Ask Claude" },
  { key: "manual", label: "Do it yourself" },
] as const;

/**
 * Two ways onto the same OAuth approval screen, presented like Module 0's
 * step rail — one panel at a time, Ask Claude first.
 */
export function ConnectionSetup({
  endpointUrl,
}: {
  endpointUrl: string | null;
}) {
  const [active, setActive] = useState(0);

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
      <ol className="flex divide-x divide-border border-b border-border">
        {OPTIONS.map((option, index) => (
          <li key={option.key} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setActive(index)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-3 text-left transition sm:px-4",
                index === active ? "bg-muted/60" : "hover:bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold",
                  index === active
                    ? "border border-foreground text-foreground"
                    : "border border-border text-muted-foreground",
                )}
              >
                {String.fromCharCode(65 + index)}
              </span>
              <span
                className={cn(
                  "truncate text-[13px]",
                  index === active
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {option.label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="p-6 lg:p-8">
        {active === 0 ? <AskClaudePanel endpointUrl={endpointUrl} /> : null}
        {active === 1 ? <ManualPanel /> : null}

        <div className="mt-8 border-t border-border pt-5">
          <RecheckButton label="I've connected — check now" size="lg" />
        </div>
      </div>
    </div>
  );
}

function AskClaudePanel({ endpointUrl }: { endpointUrl: string | null }) {
  const prompt = mcpConnectPrompt(endpointUrl);
  const desktopUrl = claudeDesktopChatUrl(prompt);
  const browserUrl = claudeChatUrl(prompt);

  return (
    <>
      <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
        Ask Claude to set it up
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Opens Claude with a ready-made message. Send it, and Claude will walk
        you through adding this workspace as a custom connector — you still
        approve access once.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Message to send
          </p>
          <CopyButton value={prompt} label="Copy" />
        </div>
        <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap px-4 py-4 font-mono text-[11.5px] leading-5 text-foreground">
          {prompt}
        </pre>
      </div>

      <div className="mt-4">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <a href={desktopUrl}>Open Claude with this message</a>
        </Button>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Opens in the Claude desktop app when installed.{" "}
          <a
            href={browserUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Open in browser instead
          </a>
        </p>
      </div>
    </>
  );
}

function ManualPanel() {
  return (
    <>
      <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
        Connect it yourself
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Same result — you paste the workspace address into Claude&apos;s
        connector settings and approve access once.
      </p>

      <ol className="mt-6 border-t border-border">
        <ManualStep index={1} title="Open Claude's connector settings">
          In Claude, go to{" "}
          <span className="font-medium text-foreground">
            Settings → Connectors
          </span>{" "}
          and choose{" "}
          <span className="font-medium text-foreground">
            Add custom connector
          </span>
          .{" "}
          <a
            href={CLAUDE_CONNECTOR_SETTINGS_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Open connector settings
          </a>
        </ManualStep>
        <ManualStep index={2} title="Paste the address above">
          That tells Claude where your workspace lives.
        </ManualStep>
        <ManualStep index={3} title="Approve access">
          Claude sends you back here to sign in and approve. One click, and you
          can revoke it from Claude whenever you like.
        </ManualStep>
        <ManualStep index={4} title="Come back and run the check">
          Once it&apos;s connected, this page confirms it and opens your first
          module.
        </ManualStep>
      </ol>
    </>
  );
}

function ManualStep({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 border-b border-border py-4 last:border-b-0">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-inverse font-mono text-[11px] font-semibold text-brand-lime">
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {children}
        </p>
      </div>
    </li>
  );
}
