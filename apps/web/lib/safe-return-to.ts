// Only allow same-origin relative paths as a post-sign-in redirect target,
// so a crafted returnTo value can never send a user off-site.
export function safeReturnTo(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }

  return raw;
}
