import { NextResponse } from "next/server";

import { buildAuthorizationServerMetadata } from "@/lib/mcp-oauth-compat/discovery";

// Static metadata, no session/database access — see
// apps/web/lib/mcp-oauth-compat/discovery.ts for why this lives at this
// exact path instead of being served by better-auth's own `mcp()` plugin.
export const runtime = "nodejs";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

export async function GET() {
  const metadata = buildAuthorizationServerMetadata({
    issuer: requireEnv("AUTH_ISSUER_URL"),
  });
  return NextResponse.json(metadata);
}
