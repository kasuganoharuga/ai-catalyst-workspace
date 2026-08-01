import { ExternalLink } from "lucide-react";

import { CopyButton } from "../../components/copy-button";
import type { Assistant } from "../../lib/assistant";
import type { ManualStep } from "../../lib/copy";
import { STEP_ILLUSTRATIONS } from "./step-illustrations";

export function ConnectionSetupStep({
  assistant,
  step,
  index,
  endpointUrl,
}: {
  assistant: Assistant;
  step: ManualStep;
  index: number;
  endpointUrl: string;
}) {
  const Illustration = step.illustration
    ? STEP_ILLUSTRATIONS[step.illustration]
    : null;
  const { settingsWebUrl } = assistant;
  const { settingsFallbackPrefix, settingsFallbackLink } = assistant.copy;

  return (
    <li className="flex gap-4 border-b border-border py-5 last:border-b-0">
      {/* Lime fill + dark text stays readable in both themes. */}
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-lime font-mono text-[12px] font-bold text-brand-lime-foreground">
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4 md:flex-row md:items-start md:gap-6">
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
          {/* Desktop deep link first. The browser fallback only exists for
              assistants whose settings are reachable in a browser at all —
              ChatGPT's are not, so offering one would send a founder
              somewhere the connection cannot be made. */}
          {step.linkLabel ? (
            <div className="mt-1.5">
              <a
                href={assistant.settingsDesktopUrl}
                className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline underline-offset-4"
              >
                {step.linkLabel}
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
              {settingsWebUrl && settingsFallbackLink ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {settingsFallbackPrefix}{" "}
                  <a
                    href={settingsWebUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    {settingsFallbackLink}
                  </a>
                </p>
              ) : null}
            </div>
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
        {Illustration ? (
          <div className="w-full shrink-0 md:w-52 lg:w-64">
            <Illustration />
          </div>
        ) : null}
      </div>
    </li>
  );
}
