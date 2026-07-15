import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { acceptFounderInvitation } from "@ai-catalyst/services/invitation";

import { auth } from "@/lib/auth";
import { actorContextFromSession } from "@/lib/actor-context";
import { serviceErrorResponse } from "@/lib/service-error-response";

// Uses `pg` (via packages/services) and node:crypto — neither is available
// on the Edge runtime.
export const runtime = "nodejs";

function unauthenticatedResponse() {
  return NextResponse.json(
    { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
    { status: 401 },
  );
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return unauthenticatedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const actor = actorContextFromSession(session);
    const token =
      typeof body === "object" && body !== null && "token" in body
        ? (body as { token: unknown }).token
        : undefined;

    const { invitation, workspace } = await acceptFounderInvitation(
      actor,
      token,
    );

    // Never cache this response and never log the request body — it may
    // carry the raw invitation token.
    return NextResponse.json(
      { invitation, workspace },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
