import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoProps = {
  variant?: "full" | "compact";
  priority?: boolean;
  className?: string;
};

export function Logo({ variant = "full", priority, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/catalyst-logo.png"
        alt={variant === "full" ? "" : "AI Catalyst"}
        width={32}
        height={32}
        priority={priority}
        className="h-8 w-8 rounded-lg object-cover"
      />
      {variant === "full" ? (
        <span className="text-base font-semibold tracking-tight text-foreground">
          AI Catalyst
        </span>
      ) : null}
    </span>
  );
}
