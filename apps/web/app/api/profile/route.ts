import { NextResponse } from "next/server";

import { getMyProfile, updateMyProfile } from "@ai-catalyst/services/profile";

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

// Both handlers act on the caller's own profile only — the actor's user
// id comes from the session, never from the request body, so there is no
// parameter through which one user could read or write another's row.

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return unauthenticatedResponse();
  }

  try {
    const actor = actorContextFromSession(session);
    const profile = await getMyProfile(actor);
    return NextResponse.json({ profile });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
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
    const profile = await updateMyProfile(actor, body);
    return NextResponse.json({ profile });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
