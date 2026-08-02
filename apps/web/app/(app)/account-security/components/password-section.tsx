import { Button } from "@/components/ui/button";

import { PasswordChangeForm } from "../../components/password-change-form";

export function PasswordSection() {
  return (
    <section className="mt-8 max-w-2xl">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Password
      </h2>

      <PasswordChangeForm
        className="mt-3 border-t border-border pt-6"
        successNote="Password updated. Other devices have been signed out and your AI assistant disconnected."
      />

      {/* Reset-by-email is styled but deliberately inert: no SMTP is wired
          up yet, so `sendResetPassword` isn't configured on the server.
          Shipping a button that silently fails would be worse than saying
          so — this states the limitation and gives a route that works. */}
      <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5">
        <p className="text-sm font-semibold text-foreground">
          Forgotten your password?
        </p>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          Reset-by-email isn&apos;t switched on yet. Until it is, ask your
          program lead and they&apos;ll sort it out for you.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          className="mt-4"
        >
          Email me a reset link
        </Button>
        <span className="ml-3 text-xs text-muted-foreground">
          Not available yet
        </span>
      </div>
    </section>
  );
}
