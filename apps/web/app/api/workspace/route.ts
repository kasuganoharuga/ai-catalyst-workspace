import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getMyWorkspace } from "@ai-catalyst/services/workspace";

import { auth } from "@/lib/auth";
import { actorContextFromSession } from "@/lib/actor-context";
import { serviceErrorResponse } from "@/lib/service-error-response";

// Uses `pg` (via packages/services) — not available on the Edge runtime.
export const runtime = "nodejs";

function unauthenticatedResponse() {
  return NextResponse.json(
    { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
    { status: 401 },
  );
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return unauthenticatedResponse();
  }

  try {
    const actor = actorContextFromSession(session);
    const workspace = await getMyWorkspace(actor);
    return NextResponse.json({ workspace });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
