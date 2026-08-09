import { StartModuleAttemptButton } from "../../../components/start-module-attempt-button";
import { retryCopy } from "../../../lib/copy";
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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-5 py-4 sm:px-6">
        <h2 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
          {retryCopy.title}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {retryCopy.body}
        </p>
      </div>
      <div className="px-5 py-5 sm:px-6">
        <StartModuleAttemptButton
          programRunModuleId={programRunModuleId}
          className="text-white hover:brightness-110"
          style={moduleAccentStyle(moduleIndex)}
        />
      </div>
    </div>
  );
}
