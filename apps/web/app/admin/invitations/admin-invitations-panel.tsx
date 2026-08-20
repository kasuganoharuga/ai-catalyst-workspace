"use client";

import { useState } from "react";

import type { InvitationListItem } from "@ai-catalyst/shared";

import { cn } from "@/lib/utils";

import { CreateInvitationForm } from "./create-invitation-form";
import { InvitationList } from "./invitation-list";

type InviteTab = "mentor" | "founder";

const TABS: {
  id: InviteTab;
  label: string;
  intro: string;
  emptyLabel: string;
}[] = [
  {
    id: "mentor",
    label: "Mentors",
    intro:
      "A mentor joins supporting nobody. They grow their roster by inviting founders.",
    emptyLabel: "No mentor invitations yet.",
  },
  {
    id: "founder",
    label: "Founders",
    intro:
      "Admin-issued founder invitations create an unsupported workspace. Invite through a mentor when the founder should have one from the start.",
    emptyLabel: "No founder invitations yet.",
  },
];

function pendingCount(invitations: InvitationListItem[]): number {
  return invitations.filter((invitation) => invitation.status === "pending")
    .length;
}

export function AdminInvitationsPanel({
  mentorInvitations,
  founderInvitations,
}: {
  mentorInvitations: InvitationListItem[];
  founderInvitations: InvitationListItem[];
}) {
  const [tab, setTab] = useState<InviteTab>("mentor");
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];
  const invitations = tab === "mentor" ? mentorInvitations : founderInvitations;

  return (
    <div className="mt-10">
      <div
        role="tablist"
        aria-label="Invitation type"
        className="flex gap-6 border-b border-border"
      >
        {TABS.map((item) => {
          const selected = item.id === tab;
          const count = pendingCount(
            item.id === "mentor" ? mentorInvitations : founderInvitations,
          );
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`invite-tab-${item.id}`}
              aria-controls={`invite-panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={cn(
                "-mb-px border-b-2 pb-3 text-sm font-medium transition",
                selected
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              <span
                className={cn(
                  "ml-2 font-mono text-[11px] tabular-nums",
                  selected
                    ? "text-muted-foreground"
                    : "text-muted-foreground/80",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`invite-panel-${active.id}`}
        aria-labelledby={`invite-tab-${active.id}`}
        className="mt-8"
      >
        <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
          {active.intro}
        </p>

        <CreateInvitationForm inviteRole={active.id} />

        <InvitationList
          inviteRole={active.id}
          invitations={invitations}
          emptyLabel={active.emptyLabel}
        />
      </div>
    </div>
  );
}
