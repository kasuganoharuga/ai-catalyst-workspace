import { module1Copy } from "../../../../lib/copy";
import type { Module1RunProps } from "../../types";
import { StepHeading } from "../shared/step-heading";

/**
 * Deliberately doesn't list the questions — Claude asks them one at a
 * time for a reason, and reading them cold invites pre-drafted answers.
 */
export function Module1BriefStep({ moduleIndex }: Module1RunProps) {
  return (
    <>
      <StepHeading
        title={module1Copy.briefTitle}
        body={module1Copy.briefBody}
      />

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {module1Copy.whyHeading}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {module1Copy.whyBody}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {module1Copy.whyBuildsOn(String(moduleIndex))}
        </p>
      </div>

      {/* The honest warning, before they start rather than after. */}
      <div className="mt-8 rounded-md border border-border bg-muted/40 p-5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {module1Copy.beforeHeading}
        </p>
        <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
          {module1Copy.before.map((item) => (
            <li key={item.lead} className="flex gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>
                <span className="font-medium text-foreground">{item.lead}</span>{" "}
                {item.body}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
