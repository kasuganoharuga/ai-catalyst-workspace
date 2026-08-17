import {
  createEmailSenderFromConfig,
  loadEmailConfigFromEnv,
  type EmailConfig,
  type EmailSender,
} from "@ai-catalyst/services/email";

/**
 * The web app's outbound email sender.
 *
 * `packages/services/src/email` deliberately never reads `process.env` — app
 * wiring passes the config in. This module is that wiring for apps/web, and
 * until now nothing performed it: the email package was complete but had no
 * production call site anywhere.
 *
 * Memoised lazily rather than built at module load, mirroring
 * `packages/services/src/storage/index.ts`'s default-provider handling: a
 * module-level `loadEmailConfigFromEnv()` would throw at import time in any
 * environment missing `EMAIL_FROM`, taking down routes that never send mail.
 */
let sender: EmailSender | null = null;
let cachedConfig: EmailConfig | null = null;

/**
 * Only the two variables that matter, rather than NodeJS.ProcessEnv — that type
 * requires NODE_ENV, so callers (and tests) could not pass a partial env.
 */
type EnvLike = Record<string, string | undefined>;

/** Deployments where mail is really expected to leave the building. */
const DELIVERING_APP_ENVS = new Set(["staging", "production"]);

/**
 * Environments where a discarded (noop) email is an acceptable default.
 *
 * Deny-list, not allow-list, matching `isModuleResetAllowed`
 * (packages/services/src/module/reset-allowed.ts) — only an explicitly named
 * deployment is treated as real. An allow-list is what broke this the first
 * time: it recognised `development`/`test` but not `local`, which is what this
 * repo actually uses (.env.example, and all three services in
 * infra/docker/docker-compose.yml), so every local `next dev` and every
 * compose `web` container died at boot on the default EMAIL_PROVIDER=noop.
 *
 * Keyed on APP_ENV and deliberately NOT on NODE_ENV, for the same reason the
 * rest of the app is (see the "Runtime APP_ENV gate (not NODE_ENV)" note in
 * app/(app)/modules/[moduleKey]/components/module-detail-body.tsx): a staging
 * image is a Next.js production build, so NODE_ENV=production says nothing
 * about which deployment this is — and `next build` itself runs with
 * NODE_ENV=production and no EMAIL_* set, which would turn this guard into a
 * build break.
 *
 * Known limit, stated rather than papered over: staging's live task definition
 * often has APP_ENV unset (deploy-aws.yml only rewrites the image — see the
 * comment in reset-allowed.ts), so this guard will not fire there. It is a
 * cheap catch for an obvious misconfiguration, not the thing that guarantees
 * delivery; that is Terraform setting EMAIL_PROVIDER=ses explicitly in
 * common_env.
 */
function isNonProductionEnv(env: EnvLike = process.env): boolean {
  const appEnv = (env.APP_ENV ?? "").trim().toLowerCase();
  return !DELIVERING_APP_ENVS.has(appEnv);
}

/**
 * Refuse to boot a real environment on the noop transport.
 *
 * Once an email code is a way to sign in, `EMAIL_PROVIDER=noop` in staging or
 * production is not a harmless default — every code is written to the server
 * log while the user waits for mail that will never arrive. That reads as a
 * mystery auth outage, and it puts live sign-in codes in CloudWatch. Failing
 * at startup is the loud version of the same fact.
 *
 * Exported for the test that asserts this actually fires.
 */
export function assertEmailProviderAllowed(env: EnvLike = process.env): void {
  const kind = (env.EMAIL_PROVIDER ?? "noop").trim().toLowerCase();
  if (kind === "noop" && !isNonProductionEnv(env)) {
    throw new Error(
      `EMAIL_PROVIDER=noop is not allowed when APP_ENV="${env.APP_ENV}". ` +
        "Sign-in codes would be written to the server log instead of delivered. " +
        "Set EMAIL_PROVIDER=ses (with EMAIL_FROM and AWS_REGION).",
    );
  }
}

/** True when mail is being discarded — callers may then surface the code locally. */
export function isEmailDiscarded(): boolean {
  return resolveEmailConfig().kind === "noop";
}

function resolveEmailConfig(): EmailConfig {
  if (!cachedConfig) {
    assertEmailProviderAllowed();
    cachedConfig = loadEmailConfigFromEnv();
  }
  return cachedConfig;
}

export function getEmailSender(): EmailSender {
  if (!sender) {
    sender = createEmailSenderFromConfig(resolveEmailConfig());
  }
  return sender;
}
