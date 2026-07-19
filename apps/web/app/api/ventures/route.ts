import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createVenture, listVentures } from "@ai-catalyst/services/venture";

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

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return unauthenticatedResponse();
  }

  try {
    const actor = actorContextFromSession(session);
    const ventures = await listVentures(actor);
    return NextResponse.json({ ventures });
  } catch (error) {
    return serviceErrorResponse(error);
  }
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
    const venture = await createVenture(actor, body);
    return NextResponse.json({ venture }, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
