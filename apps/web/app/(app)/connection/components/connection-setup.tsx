import { ChevronDown, HelpCircle } from "lucide-react";

import { ClaudeHandoff } from "../../components/claude-handoff";
import { connectionCopy } from "../../lib/copy";
import { mcpConnectPrompt } from "../../lib/module-display";
import { ConnectionSetupStep } from "./connection-setup-step";
import { ConnectionWatcher } from "./connection-watcher";

/** Manual connector steps with the workspace address inline. */
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

        <ol className="mt-6 border-t border-border">
          {connectionCopy.manualSteps.map((step, index) => (
            <ConnectionSetupStep
              key={step.title}
              step={step}
              index={index}
              endpointUrl={endpointUrl}
            />
          ))}
        </ol>

        <details className="group mt-6 border-t border-border pt-5">
          {/* `list-none` hides the native marker; chevron replaces it. */}
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

        {/* Kept visually distinct — founders who need this are already stuck. */}
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

        {/* ConnectionWatcher polls; no manual "I've connected" button. */}
        <div className="mt-8 border-t border-border pt-5">
          <ConnectionWatcher />
        </div>
      </div>
    </div>
  );
}
