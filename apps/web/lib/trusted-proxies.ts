/**
 * Networks whose `X-Forwarded-For` hops may be believed, as CIDR ranges.
 *
 * A deployment fact, so it arrives through the environment rather than being
 * written into the app: Terraform sets `AUTH_TRUSTED_PROXIES` to the VPC the
 * ALB forwards from (infra/aws/terraform/envs/staging). Unset — local, CI,
 * anywhere with no proxy in front — yields an empty list, and Better Auth then
 * keeps its stricter rule of believing `X-Forwarded-For` only when it holds a
 * single value. See the `advanced.ipAddress` comment in ./auth.ts for what each
 * mode does and why the empty case is the safe one.
 *
 * Its own module, rather than a helper inside auth.ts, so the parsing contract
 * Terraform feeds can be tested without importing Better Auth — auth.ts asserts
 * AUTH_ISSUER_URL and BETTER_AUTH_SECRET at module load, which the offline test
 * job does not set.
 */
export function parseTrustedProxies(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function readTrustedProxies(): string[] {
  return parseTrustedProxies(process.env.AUTH_TRUSTED_PROXIES);
}
