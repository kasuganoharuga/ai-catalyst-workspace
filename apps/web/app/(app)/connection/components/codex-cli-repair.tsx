import { CopyButton } from "../../components/copy-button";
import { connectionCopy } from "../../lib/copy";

/**
 * Codex CLI fallback for the OpenAI path only. Primary repair remains the
 * Streamable HTTP desktop steps — this is for founders already on Codex.
 */
export function CodexCliRepair({ endpointUrl }: { endpointUrl: string }) {
  const addCommand = `codex mcp add ai_catalyst --url ${endpointUrl}`;
  const loginCommand = "codex mcp login ai_catalyst";

  return (
    <div className="mt-6 rounded-lg border border-border bg-muted/40 px-5 py-4">
      <p className="text-sm font-semibold text-foreground">
        {connectionCopy.codexCliTitle}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {connectionCopy.codexCliBody}
      </p>
      <div className="mt-4 space-y-3">
        <CommandRow
          label={connectionCopy.codexCliAddLabel}
          value={addCommand}
        />
        <CommandRow
          label={connectionCopy.codexCliLoginLabel}
          value={loginCommand}
        />
      </div>
    </div>
  );
}

function CommandRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
          {value}
        </code>
        <CopyButton value={value} label="Copy" />
      </div>
    </div>
  );
}
