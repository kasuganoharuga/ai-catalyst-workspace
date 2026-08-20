import type { ReactNode } from "react";

export function StepHeading({
  title,
  body,
}: {
  title: string;
  body: ReactNode;
}) {
  return (
    <>
      <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </>
  );
}
