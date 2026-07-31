import { ShieldAlert } from "lucide-react";

export function InvalidConsentRequest() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <ShieldAlert aria-hidden="true" className="h-10 w-10 text-destructive" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        This authorisation request is invalid or has expired.
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Go back to the application you were connecting and try again.
      </p>
    </div>
  );
}
