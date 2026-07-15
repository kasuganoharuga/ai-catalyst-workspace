import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { revokeFounderInvitation } from "@ai-catalyst/services/invitation";

import { auth } from "@/lib/auth";
import { actorContextFromSession } from "@/lib/actor-context";
import { serviceErrorResponse } from "@/lib/service-error-response";

// Uses `pg` (via packages/services) — not available on the Edge runtime.
export const runtime = "nodejs";

type RevokeRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RevokeRouteContext) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
      { status: 401 },
    );
  }

  try {
    const actor = actorContextFromSession(session);
    const { id } = await context.params;
    const invitation = await revokeFounderInvitation(actor, id);
    return NextResponse.json({ invitation });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
