"use client";

import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground";

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
  rows = 3,
  placeholder,
  autoComplete,
  inputMode,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={INPUT_CLASS}
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          className={INPUT_CLASS}
        />
      )}
      {hint ? (
        <span className="block text-xs leading-5 text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
