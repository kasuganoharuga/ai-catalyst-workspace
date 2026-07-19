import { NextResponse } from "next/server";

import { confirmModuleCompletion } from "@ai-catalyst/services/module/completion";

import { auth } from "@/lib/auth";
import { actorContextFromSession } from "@/lib/actor-context";
import { serviceErrorResponse } from "@/lib/service-error-response";

// Uses `pg` (via packages/services) — not available on the Edge runtime.
export const runtime = "nodejs";

/**
 * The Founder signing off their own module output, which is what unlocks
 * the next module. Deliberately a website-only action: `complete_module`
 * over MCP stops at `ready_for_review` so the AI client can never advance
 * the programme on the Founder's behalf.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
      { status: 401 },
    );
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
    const result = await confirmModuleCompletion(actor, body);
    return NextResponse.json(result);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
