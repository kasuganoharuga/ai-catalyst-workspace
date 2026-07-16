import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getVenture } from "@ai-catalyst/services/venture";

import { auth } from "@/lib/auth";
import { actorContextFromSession } from "@/lib/actor-context";
import { serviceErrorResponse } from "@/lib/service-error-response";

// Uses `pg` (via packages/services) — not available on the Edge runtime.
export const runtime = "nodejs";

type VentureRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: VentureRouteContext) {
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
    const venture = await getVenture(actor, id);
    return NextResponse.json({ venture });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
