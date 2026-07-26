"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { VentureClaudeProjectField } from "../../../workspace/components/venture-claude-project-field";

/**
 * Post–Module 1 optional convenience — does not affect unlock or artefacts.
 */
export function OptionalClaudeProjectCard({
  ventureId,
  initialProjectId,
}: {
  ventureId: string;
  initialProjectId: string | null;
}) {
  const alreadyLinked = Boolean(initialProjectId?.trim());
  const [dismissed, setDismissed] = useState(false);
  const [showForm, setShowForm] = useState(alreadyLinked);

  if (dismissed && !alreadyLinked) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h3 className="font-serif text-lg font-medium tracking-[-0.01em] text-foreground">
        Keep your AI Catalyst work organised
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Link a Claude Project to make it easier to return to the same workspace
        in future modules. Optional — nothing about your run or unlocks changes
        when you link or clear it.
      </p>

      {showForm ? (
        <VentureClaudeProjectField
          ventureId={ventureId}
          initialProjectId={initialProjectId}
          canEdit
          isArchived={false}
        />
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={() => setShowForm(true)}>
            Link a Claude Project
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
          >
            Maybe later
          </Button>
        </div>
      )}
    </section>
  );
}
