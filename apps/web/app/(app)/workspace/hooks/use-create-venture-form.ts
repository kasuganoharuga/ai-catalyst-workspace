"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { toastCopy } from "@/app/(app)/lib/copy";
import { createVentureAction } from "@/lib/actions/founder-actions";
import { firstZodMessage } from "@/lib/validation/common";
import { createVentureInputSchema } from "@/lib/validation/venture";

export function useCreateVentureForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = createVentureInputSchema.safeParse({
      name,
      oneLiner: oneLiner.trim() === "" ? undefined : oneLiner,
      summary: summary.trim() === "" ? undefined : summary,
    });

    if (!parsed.success) {
      const message = firstZodMessage(parsed.error);
      setError(message);
      toast.error(toastCopy.actionFailedTitle, { description: message });
      return;
    }

    startTransition(async () => {
      const result = await createVentureAction({
        name: parsed.data.name,
        oneLiner: parsed.data.oneLiner ?? undefined,
        summary: parsed.data.summary ?? undefined,
      });

      if (!result.ok) {
        setError(result.message);
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message,
        });
        return;
      }

      setName("");
      setOneLiner("");
      setSummary("");
      toast.success(toastCopy.ventureCreated);
      router.refresh();
    });
  }

  return {
    name,
    setName: (value: string) => {
      setName(value);
      if (error) setError(null);
    },
    oneLiner,
    setOneLiner: (value: string) => {
      setOneLiner(value);
      if (error) setError(null);
    },
    summary,
    setSummary: (value: string) => {
      setSummary(value);
      if (error) setError(null);
    },
    error,
    isSubmitting: isPending,
    handleSubmit,
  };
}
