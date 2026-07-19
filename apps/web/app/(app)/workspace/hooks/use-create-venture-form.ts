"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createVentureAction } from "@/lib/actions/founder-actions";

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
    startTransition(async () => {
      const result = await createVentureAction({
        name,
        oneLiner: oneLiner.trim() === "" ? undefined : oneLiner,
        summary: summary.trim() === "" ? undefined : summary,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setName("");
      setOneLiner("");
      setSummary("");
      router.refresh();
    });
  }

  return {
    name,
    setName,
    oneLiner,
    setOneLiner,
    summary,
    setSummary,
    error,
    isSubmitting: isPending,
    handleSubmit,
  };
}
