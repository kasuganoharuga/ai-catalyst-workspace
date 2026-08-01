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
 * The one-time first-run flow: welcome, name, password, assistant.
 *
 * Shown whenever the founder has no stored assistant preference. Nothing
 * can be skipped — each step is either something the product needs (which
 * assistant to set up) or something the founder needs (a password that
 * isn't the one emailed to them).
 *
 * **Resumable by construction.** Each step's "done" test is the real state
 * it writes — a name on the profile, a credential row whose updated_at has
 * moved, a provider on the profile — so a founder who closes the tab
 * halfway comes back to a dialog containing only what is still outstanding.
 * There is no separate progress record to keep in step, and nothing to
 * reset if a step is later undone.
 *
 * A dialog rather than a route: the layout has no pathname to build a
 * `returnTo` from, so redirecting to a gate page would silently drop
 * wherever the founder was heading. It also keeps the OAuth routes clear —
 * they live outside this layout, so approving a connection can never be
 * interrupted by this.
 */
export function OnboardingDialog({
  needsPassword,
  needsName,
}: {
  needsPassword: boolean;
  needsName: boolean;
}) {
  const router = useRouter();

  // Fixed at mount, deliberately not derived from the props on every
  // render. Each step's own save revalidates the layout, so the props it
  // was built from change while the founder is still partway through — a
  // list that recomputed would drop the step they just completed out from
  // under the index and leave the dialog pointing past its own end.
  const [steps] = useState<StepKey[]>(() => {
    const list: StepKey[] = ["welcome"];
    if (needsName) list.push("name");
    if (needsPassword) list.push("password");
    // Always last, and always present: this component only renders when
    // the preference is missing.
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
    // The layout re-reads the profile on the next render; without this the
    // dialog would reopen on the founder's next navigation.
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
        // Fixed regardless of step: the four steps' natural content ranges
        // from ~295px (name, one row of fields) to ~405px (password, two
        // stacked fields plus a hint line), and letting the card follow
        // that made it visibly resize — and with it, jump position, since
        // Radix centres on both axes — every time the founder advanced.
        // 420px comfortably fits the tallest step with a little to spare
        // for a validation error appearing; shorter steps leave the
        // remainder as trailing whitespace rather than being stretched.
        className="max-w-xl min-h-[420px]"
        // Radix fires both of these whether or not a close button exists,
        // so the dialog is only genuinely uncloseable with them blocked.
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
