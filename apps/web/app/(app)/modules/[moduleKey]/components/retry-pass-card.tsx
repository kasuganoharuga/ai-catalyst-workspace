import { StartModuleAttemptButton } from "../../../components/start-module-attempt-button";
import { moduleAccentStyle } from "../../../lib/module-display";

/**
 * Shown when the Module still looks in progress but has no writable
 * Attempt (typical after validation_failed). One click opens a Retry so
 * Claude can save again.
 */
export function RetryPassCard({
  programRunModuleId,
  moduleIndex,
}: {
  programRunModuleId: string;
  moduleIndex: number;
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/40 px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">
          Ready for another pass
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Your last attempt is closed, so nothing new can be saved until you
          open a fresh one. Prior answers stay visible — start the pass, then
          continue in Claude.
        </p>
      </div>
      <div className="px-6 py-5">
        <StartModuleAttemptButton
          programRunModuleId={programRunModuleId}
          label="Start another pass"
          className="[&_button]:text-white [&_button]:hover:brightness-110"
          style={moduleAccentStyle(moduleIndex)}
        />
      </div>
    </div>
  );
}
