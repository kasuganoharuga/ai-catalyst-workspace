import { ChevronDown, ExternalLink, HelpCircle } from "lucide-react";

import { ClaudeHandoff } from "../../components/claude-handoff";
import { CopyButton } from "../../components/copy-button";
import { connectionCopy } from "../../lib/copy";
import {
  CLAUDE_CONNECTOR_SETTINGS_URL,
  mcpConnectPrompt,
} from "../../lib/module-display";
import { ConnectionWatcher } from "./connection-watcher";

/**
 * The steps, in the open, with the address they need sitting above them.
 *
 * This started as an A/B tab pair, then became "let Claude do it" with the
 * steps tucked away. Both were wrong for the same reason: Claude cannot
 * open its own settings, click anything, or see whether the connector
 * connected — it can only read the steps out. Worth having when a screen
 * doesn't match; not worth being the path.
 *
 * The troubleshooting block at the bottom is the part that earns its
 * place. The most common reason a founder stalls here is that "Add custom
 * connector" isn't in their Claude at all — a plan restriction — and no
 * wording of the steps above could have told them that.
 */
export function ConnectionSetup({ endpointUrl }: { endpointUrl: string }) {
  const prompt = mcpConnectPrompt(endpointUrl);

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
      <div className="p-6 lg:p-8">
        <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
          {connectionCopy.setupTitle}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {connectionCopy.setupBody}
        </p>

        {/* Steps 1-3 are single clicks through Claude's own menus. Step 4
            is the only one carrying data, so it holds the address and its
            copy button — the list gets its centre of gravity from that row
            being genuinely bigger, rather than from decoration. */}
        <ol className="mt-6 border-t border-border">
          {connectionCopy.manualSteps.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-4 border-b border-border py-4 last:border-b-0"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-inverse font-mono text-[11px] font-semibold text-brand-lime">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  {step.title}
                  {step.optional ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Optional
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {step.body}
                </p>
                {/* Underlined and on its own line. Run into the sentence
                    with hover-only underline, it read as emphasis rather
                    than as something to click. */}
                {step.linkLabel ? (
                  <a
                    href={CLAUDE_CONNECTOR_SETTINGS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-foreground underline underline-offset-4"
                  >
                    {step.linkLabel}
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {step.showAddress ? (
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground">
                      {endpointUrl}
                    </code>
                    <CopyButton value={endpointUrl} label="Copy" />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <details className="group mt-6 border-t border-border pt-5">
          {/* `list-none` removes the browser's own triangle, so the chevron
              has to be put back — without it this reads as a stray heading
              rather than something you can open. */}
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-foreground hover:underline">
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
            />
            {connectionCopy.claudeHelpSummary}
          </summary>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {connectionCopy.claudeHelpBody}
          </p>
          <div className="mt-4">
            <ClaudeHandoff
              prompt={prompt}
              label={connectionCopy.setupOpenCta}
            />
          </div>
        </details>

        {/* Not collapsed, and not another grey panel. The founder who needs
            this is stuck and doesn't know the word for why, so it has to
            catch the eye on its own — a muted card indistinguishable from
            the ones above it would be scrolled straight past. */}
        <div className="mt-6 rounded-lg border-l-2 border-brand-lime bg-muted/50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HelpCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {connectionCopy.troubleshootingTitle}
          </p>
          <dl className="mt-3 space-y-3">
            {connectionCopy.troubleshooting.map((item) => (
              <div key={item.symptom}>
                <dt className="text-sm font-semibold text-foreground">
                  {item.symptom}
                </dt>
                <dd className="mt-0.5 text-sm leading-6 text-muted-foreground">
                  {item.fix}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* No "I've connected — check now" button: the page watches for it. */}
        <div className="mt-8 border-t border-border pt-5">
          <ConnectionWatcher />
        </div>
      </div>
    </div>
  );
}
