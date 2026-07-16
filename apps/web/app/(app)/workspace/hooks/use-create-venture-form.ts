"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function useCreateVentureForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/ventures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        oneLiner: oneLiner.trim() === "" ? undefined : oneLiner,
        summary: summary.trim() === "" ? undefined : summary,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error?.message ?? "Failed to create Venture.");
      setIsSubmitting(false);
      return;
    }

    setName("");
    setOneLiner("");
    setSummary("");
    setIsSubmitting(false);
    router.refresh();
  }

  return {
    name,
    setName,
    oneLiner,
    setOneLiner,
    summary,
    setSummary,
    error,
    isSubmitting,
    handleSubmit,
  };
}
