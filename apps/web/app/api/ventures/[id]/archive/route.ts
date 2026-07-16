import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { archiveVenture } from "@ai-catalyst/services/venture";

import { auth } from "@/lib/auth";
import { actorContextFromSession } from "@/lib/actor-context";
import { serviceErrorResponse } from "@/lib/service-error-response";

// Uses `pg` (via packages/services) — not available on the Edge runtime.
export const runtime = "nodejs";

type ArchiveRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: ArchiveRouteContext) {
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
    const venture = await archiveVenture(actor, id);
    return NextResponse.json({ venture });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
