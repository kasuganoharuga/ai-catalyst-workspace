/**
 * Local, test and staging may reset. Everything else may not.
 *
 * Allow-list, and that is a deliberate reversal. This used to refuse only an
 * explicit `APP_ENV=production`, which meant an unset variable *enabled* a
 * button that permanently deletes a Founder's attempts, answers, artefacts and
 * prep material — and every Module after it in the Run. A deployment forgetting
 * one environment variable is not a hypothetical here: deploy-aws.yml only
 * rewrites the image, so a hand-built task definition carries whatever env it
 * was created with, and the live staging task definition has omitted APP_ENV
 * before.
 *
 * Both directions fail; the question is which failure is acceptable. Unset now
 * hides a testing tool (recoverable: set APP_ENV and redeploy). Unset before
 * exposed irreversible data loss to real users. So the list is explicit, and
 * anything unrecognised — including `production`, including a typo, including
 * nothing at all — is refused.
 *
 * Note this is the opposite construction to `assertEmailProviderAllowed`
 * (apps/web/lib/email.ts), which is a deny-list. Same principle, not the same
 * shape: there, the dangerous state is a *named* deployment silently
 * discarding mail, and defaulting to "real" would break every local run. Here
 * the dangerous state is the unnamed one. Each list points its default at the
 * safe outcome, which is why they differ.
 *
 * `staging` must therefore be set explicitly on the staging task definition —
 * Terraform's `common_env` does this (infra/aws/terraform/envs/staging).
 *
 * Env is read with bracket access so Next/Turbopack cannot replace
 * process.env.APP_ENV at `next build` with the empty Docker-build value.
 *
 * Kept in its own file so the predicate can be unit-tested without
 * loading reset.ts (which imports the database pool).
 */

/**
 * Deployments where wiping a Founder's progress is a convenience rather than
 * an incident. `development` is not this repo's name for local work (`local`
 * is — see .env.example and docker-compose.yml) but is accepted so a stray
 * NODE_ENV-style value does not silently disable the tool for a developer.
 */
const RESETTABLE_APP_ENVS = new Set([
  "local",
  "development",
  "test",
  "staging",
]);

function readRuntimeEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveResetAppEnv(): string | undefined {
  return readRuntimeEnv("APP_ENV") ?? readRuntimeEnv("NEXT_PUBLIC_APP_ENV");
}

export function isModuleResetAllowed(
  appEnv: string | undefined = resolveResetAppEnv(),
): boolean {
  return RESETTABLE_APP_ENVS.has((appEnv ?? "").trim().toLowerCase());
}
