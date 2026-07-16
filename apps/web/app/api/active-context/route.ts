import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  getActiveContext,
  setActiveVenture,
} from "@ai-catalyst/services/workspace/active-context";

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
    const activeContext = await getActiveContext(actor);
    return NextResponse.json({ activeContext });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

// Body contract: { "ventureId": "<uuid>" | null } — the key must be
// present. This route only checks presence/type (string | null); UUID
// format validation deliberately stays inside setActiveVenture so HTTP,
// MCP, and any direct internal caller all get the exact same
// enumeration-safe NOT_FOUND behavior for a malformed id, instead of HTTP
// alone returning a different code for the same bad input.
export async function PATCH(request: NextRequest) {
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

  if (
    typeof body !== "object" ||
    body === null ||
    !Object.prototype.hasOwnProperty.call(body, "ventureId") ||
    ((body as { ventureId: unknown }).ventureId !== null &&
      typeof (body as { ventureId: unknown }).ventureId !== "string")
  ) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "ventureId must be present and be a string or null.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const actor = actorContextFromSession(session);
    const ventureId = (body as { ventureId: string | null }).ventureId;
    const activeContext = await setActiveVenture(actor, ventureId);
    return NextResponse.json({ activeContext });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
