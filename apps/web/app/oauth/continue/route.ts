import { NextResponse } from "next/server";

import { safeReturnTo } from "@/lib/safe-return-to";

/**
 * mcp() loginPage target. Better Auth appends the full authorize query here
 * when signed out; this route folds it into `returnTo` so sign-in can resume
 * `/api/auth/mcp/authorize`, and clears the oidc_login_prompt replay cookie
 * (that path bypasses our authorize before-hook).
 *
 * Route Handler (not a page) so we can clear cookies. ChatGPT always hits
 * this path (isolated browser, no session); Claude usually skips it.
 */
export const runtime = "nodejs";

/** Params forwarded into the rebuilt authorize URL — allowlist only. */
const FORWARDED_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
  "nonce",
  "prompt",
] as const;

const REPLAY_COOKIE = "oidc_login_prompt";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams;

  const forwarded = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = requested.get(key);
    if (value !== null) {
      forwarded.set(key, value);
    }
  }

  // No client_id → nothing to resume. Destination is always our own path;
  // authorize validates redirect_uri (not an open redirect).
  const target = forwarded.has("client_id")
    ? safeReturnTo(`/api/auth/mcp/authorize?${forwarded.toString()}`)
    : null;

  const destination = target ? `/?returnTo=${encodeURIComponent(target)}` : "/";

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(REPLAY_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
