import { NextResponse } from "next/server";

import { revokeMcpAccessToken } from "@ai-catalyst/services/mcp-auth";

/**
 * RFC 7009 token revocation.
 *
 * Served here rather than under `/api/auth/mcp/` because Better Auth's
 * `[...all]` catch-all owns that whole prefix; RFC 8414 places no
 * constraint on where `revocation_endpoint` lives, so discovery points
 * clients at this path instead.
 *
 * Unauthenticated: V1 registers only public clients with no secret (see
 * mcp-oauth-compat/dcr-validation.ts), so possession of the token is the
 * only credential in existence. Requiring client authentication here
 * would make the endpoint unusable by exactly the clients it is for.
 */
export const runtime = "nodejs";

// RFC 7009 §2.1 specifies application/x-www-form-urlencoded. Accepting
// JSON as well costs nothing and saves a client that guessed wrong from
// silently failing to revoke anything.
async function readToken(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { token?: unknown };
      return typeof body.token === "string" ? body.token : null;
    }
    const form = await request.formData();
    const token = form.get("token");
    return typeof token === "string" ? token : null;
  } catch {
    // A malformed body is indistinguishable from an unknown token as far
    // as the response is concerned — see below.
    return null;
  }
}

export async function POST(request: Request) {
  const token = await readToken(request);

  if (token) {
    await revokeMcpAccessToken(token);
  }

  // 200 regardless — RFC 7009 §2.2: "The authorization server responds
  // with HTTP status code 200 if the token has been revoked successfully
  // or if the client submitted an invalid token." Distinguishing the two
  // would turn this into an oracle for whether a given token is real.
  //
  // `token_type_hint` is accepted and ignored: V1 only ever issues one
  // kind of usable token, so there is nothing for the hint to select.
  return new NextResponse(null, { status: 200 });
}

// RFC 7009 §2.1 is POST-only. Answering 405 with Allow is more useful to
// a client than Next's default 404 for an undefined method.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
