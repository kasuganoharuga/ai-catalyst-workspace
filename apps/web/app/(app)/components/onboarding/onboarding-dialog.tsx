"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { onboardingCopy } from "../../lib/copy";
import { AssistantStep } from "./assistant-step";
import { NameStep } from "./name-step";
import { PasswordStep } from "./password-step";
import { WelcomeStep } from "./welcome-step";

type StepKey = "welcome" | "name" | "password" | "assistant";

/**
 * First-run flow: welcome, name, password, assistant. Nothing can be skipped.
 *
 * Resumable by real state (name, password, provider) — no separate progress record.
 * A dialog, not a route: the layout has no pathname for `returnTo`, and OAuth lives outside it.
 */
export function OnboardingDialog({
  needsPassword,
  needsName,
}: {
  needsPassword: boolean;
  needsName: boolean;
}) {
  const router = useRouter();

  // Fixed at mount — revalidating the layout changes props mid-flow and would drop completed steps.
  const [steps] = useState<StepKey[]>(() => {
    const list: StepKey[] = ["welcome"];
    if (needsName) list.push("name");
    if (needsPassword) list.push("password");
    list.push("assistant");
    return list;
  });

  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const step = steps[index];

  function goNext() {
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function finish() {
    setOpen(false);
    router.refresh();
  }

  const header = {
    welcome: {
      title: onboardingCopy.welcomeTitle,
      body: onboardingCopy.welcomeBody,
    },
    name: { title: onboardingCopy.nameTitle, body: onboardingCopy.nameBody },
    password: {
      title: onboardingCopy.passwordTitle,
      body: onboardingCopy.passwordBody,
    },
    assistant: {
      title: onboardingCopy.assistantTitle,
      body: onboardingCopy.assistantBody,
    },
  }[step];

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        // Fixed height — step content varies ~295–405px and Radix centres on both axes.
        className="max-w-xl min-h-[420px]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {onboardingCopy.progress(index + 1, steps.length)}
          </p>
          <DialogTitle>{header.title}</DialogTitle>
          <DialogDescription>{header.body}</DialogDescription>
        </DialogHeader>

        {step === "welcome" ? <WelcomeStep onDone={goNext} /> : null}
        {step === "name" ? <NameStep onDone={goNext} /> : null}
        {step === "password" ? <PasswordStep onDone={goNext} /> : null}
        {step === "assistant" ? <AssistantStep onDone={finish} /> : null}
      </DialogContent>
    </Dialog>
  );
}
