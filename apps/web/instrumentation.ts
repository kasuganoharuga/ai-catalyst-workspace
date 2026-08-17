export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Fail the boot rather than the first sign-in attempt. On the noop
    // transport every emailed sign-in code is discarded and written to the
    // server log instead, which in a real environment is both an outage
    // nobody can diagnose from the outside and live credentials in
    // CloudWatch. Checked here so a misconfigured deploy never reaches
    // traffic; see lib/email.ts for the rule itself.
    const { assertEmailProviderAllowed } = await import("./lib/email");
    assertEmailProviderAllowed();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
