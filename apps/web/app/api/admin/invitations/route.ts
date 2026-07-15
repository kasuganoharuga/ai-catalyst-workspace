import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createFounderInvitation } from "@ai-catalyst/services/invitation";

import { auth } from "@/lib/auth";
import { actorContextFromSession } from "@/lib/actor-context";
import { listFounderInvitations } from "@/lib/invitations";
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
    const invitations = await listFounderInvitations(actor);
    return NextResponse.json({ invitations });
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
    const { invitation, rawToken } = await createFounderInvitation(
      actor,
      body as { email: string; personalMessage?: string },
    );

    // rawToken is the only time the plaintext invite token exists outside
    // the database — never cache this response, and never log the body of
    // this handler (including on the error path above).
    return NextResponse.json(
      { invitation, rawToken },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
