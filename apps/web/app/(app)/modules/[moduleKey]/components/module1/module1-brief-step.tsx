import { TriangleAlert } from "lucide-react";

import { resolveModuleCopy } from "../../../../lib/copy";
import type { Module1RunProps } from "../../types";
import { StepHeading } from "../shared/step-heading";

/**
 * Deliberately doesn't list the questions — Claude asks them one at a
 * time for a reason, and reading them cold invites pre-drafted answers.
 */
export function Module1BriefStep({ moduleKey, moduleIndex }: Module1RunProps) {
  const copy = resolveModuleCopy(moduleKey);
  return (
    <>
      <StepHeading title={copy.briefTitle} body={copy.briefBody} />

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {copy.whyHeading}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {copy.whyBody}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {copy.whyBuildsOn(String(moduleIndex))}
        </p>
      </div>

      {/* The honest warning, before they start rather than after. */}
      <div className="mt-8 rounded-md border border-border bg-muted/40 p-5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {copy.beforeHeading}
        </p>
        <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
          {copy.before.map((item) =>
            item.severity === "warning" ? (
              // A hard prerequisite, not advice — it gets the founder's
              // attention before the list they are likely to skim.
              <li
                key={item.lead}
                className="flex gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3"
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-1 h-4 w-4 shrink-0 text-destructive"
                />
                <span className="font-semibold text-destructive">
                  {item.lead}
                  {item.body ? (
                    <span className="font-normal text-foreground">
                      {" "}
                      {item.body}
                    </span>
                  ) : null}
                </span>
              </li>
            ) : (
              <li key={item.lead} className="flex gap-2.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                <span>
                  <span className="font-medium text-foreground">
                    {item.lead}
                  </span>{" "}
                  {item.body ?? null}
                </span>
              </li>
            ),
          )}
        </ul>
      </div>
    </>
  );
}
