import { HelpCircle } from "lucide-react";

import type { Assistant } from "../../lib/assistant";
import { connectionCopy } from "../../lib/copy";
import { ConnectionSetupStep } from "./connection-setup-step";
import { ConnectionWatcher } from "./connection-watcher";

/**
 * Manual connector steps with inline workspace address — no assistant walkthrough (cannot observe connection success).
 * Wireframes and troubleshooting carry setup guidance instead.
 */
export function ConnectionSetup({
  assistant,
  endpointUrl,
}: {
  assistant: Assistant;
  endpointUrl: string;
}) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
      <div className="p-6 lg:p-8">
        <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
          {assistant.copy.setupTitle}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {assistant.copy.setupBody}
        </p>

        <ol className="mt-6 border-t border-border">
          {assistant.copy.manualSteps.map((step, index) => (
            <ConnectionSetupStep
              key={step.title}
              assistant={assistant}
              step={step}
              index={index}
              endpointUrl={endpointUrl}
            />
          ))}
        </ol>

        {/* Kept visually distinct — founders who need this are already stuck. */}
        <div className="mt-6 rounded-lg border-l-2 border-brand-lime bg-muted/50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HelpCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {connectionCopy.troubleshootingTitle}
          </p>
          <dl className="mt-3 space-y-3">
            {assistant.copy.troubleshooting.map((item) => (
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
          <ConnectionWatcher provider={assistant.provider} />
        </div>
      </div>
    </div>
  );
}
