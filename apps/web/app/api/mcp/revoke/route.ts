import { NextResponse } from "next/server";

import { revokeMcpAccessToken } from "@ai-catalyst/services/mcp-auth";

/**
 * RFC 7009 token revocation.
 *
 * Lives outside Better Auth's `/api/auth/mcp/` catch-all. Unauthenticated — V1
 * public clients have no secret; possession of the token is the only credential.
 */
export const runtime = "nodejs";

// Accept JSON as well as form-urlencoded (RFC 7009 §2.1).
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
    return null;
  }
}

export async function POST(request: Request) {
  const token = await readToken(request);

  if (token) {
    await revokeMcpAccessToken(token);
  }

  // Always 200 — distinguishing valid/invalid tokens would be an oracle (RFC 7009 §2.2).
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
