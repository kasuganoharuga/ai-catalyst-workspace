"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { updateVentureClaudeProjectAction } from "@/lib/actions/founder-actions";

import {
  claudeChatProjectUrl,
  claudeChatProjectWebUrl,
} from "../../lib/module-display";

type VentureClaudeProjectFieldProps = {
  ventureId: string;
  initialProjectId: string | null;
  canEdit: boolean;
  isArchived: boolean;
};

export function VentureClaudeProjectField({
  ventureId,
  initialProjectId,
  canEdit,
  isArchived,
}: VentureClaudeProjectFieldProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(initialProjectId ?? "");
  const [saved, setSaved] = useState(initialProjectId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const isDirty = value.trim() !== saved.trim();
  const saveDisabled =
    !canEdit || isArchived || !isDirty || status === "saving" || isPending;
  const savedProjectId = saved.trim() || null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    const trimmed = value.trim();
    const payload = trimmed === "" ? null : trimmed;

    try {
      const result = await updateVentureClaudeProjectAction(ventureId, payload);

      if (!result.ok) {
        setStatus("idle");
        setError(result.message);
        return;
      }

      const nextSaved = payload ?? "";
      setSaved(nextSaved);
      setValue(nextSaved);
      setStatus("saved");
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setStatus("idle");
      setError("Something went wrong.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 border-t border-border/70 pt-4"
    >
      <div>
        <label
          htmlFor={`claude-project-${ventureId}`}
          className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
        >
          Claude Chat Project ID
        </label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          From{" "}
          <span className="font-medium text-foreground">
            claude.ai/projects
          </span>
          : open your Project and copy the UUID at the end of the URL.
        </p>
        <input
          id={`claude-project-${ventureId}`}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setStatus("idle");
          }}
          disabled={!canEdit || isArchived}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-2.5 font-mono text-sm outline-none focus:border-foreground focus:ring-2 focus:ring-ring/50 disabled:opacity-60"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={saveDisabled}>
          {status === "saving" || isPending ? "Saving..." : "Save project ID"}
        </Button>
        {status === "saved" ? (
          <p className="text-xs text-muted-foreground">Saved.</p>
        ) : null}
        {savedProjectId ? (
          <>
            <Button asChild size="sm" variant="outline">
              <a href={claudeChatProjectUrl(savedProjectId)}>Open in Claude</a>
            </Button>
            <a
              href={claudeChatProjectWebUrl(savedProjectId)}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              View on claude.ai
            </a>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
