import type { EmailConfig } from "./types.js";

/**
 * Build EmailConfig from environment. Call only from composition roots —
 * transports never read process.env themselves.
 *
 * - `EMAIL_PROVIDER` = `noop` (default) | `ses`
 * - ses: `EMAIL_FROM`, `AWS_REGION`
 */
export function loadEmailConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmailConfig {
  const kind = (env.EMAIL_PROVIDER ?? "noop").trim().toLowerCase();
  if (kind === "noop") {
    return { kind: "noop" };
  }
  if (kind === "ses") {
    const from = env.EMAIL_FROM?.trim();
    const region = env.AWS_REGION?.trim();
    if (!from) {
      throw new Error("EMAIL_PROVIDER=ses requires EMAIL_FROM.");
    }
    if (!region) {
      throw new Error("EMAIL_PROVIDER=ses requires AWS_REGION.");
    }
    return { kind: "ses", from, region };
  }
  throw new Error(
    `Unsupported EMAIL_PROVIDER="${kind}". Expected "noop" or "ses".`,
  );
}
