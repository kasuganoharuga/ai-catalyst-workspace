import { NextResponse } from "next/server";

import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";

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

// POST-only: this endpoint's "get or create" semantics don't map onto a
// plain GET (fetching a Venture's current Program Run, once that read path
// exists, belongs at GET /api/ventures/[id] or a dedicated read route —
// not here, since a GET must never have this route's side effect of
// possibly creating a Run).
//
// Typed as the standard Fetch API `Request` (not `NextRequest`) since only
// `.json()`/`.headers` are used here — same reasoning as auth's route,
// which lets tests/program-runs.http.test.ts call this handler directly
// with a plain `Request`, the same way tests/auth.http.test.ts already
// does. Reads session from `request.headers` directly rather than
// `headers()` from `next/headers` for the same reason: `headers()` needs
// Next's request-scoped AsyncLocalStorage, which only exists inside an
// actual Next.js server request — calling it from a Route Handler that
// already has the Request in hand is unnecessary indirection, and breaks
// exactly this kind of direct-invocation test.
export async function POST(request: Request) {
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
    const result = await getOrCreateProgramRun(actor, body);
    // 201 only when this call actually inserted a new Run — a repeat call
    // for the same Venture returns the existing Run with 200, the same
    // distinction createVenture (always 201) and archiveVenture (always
    // 200, even on its idempotent no-op path) each make individually.
    return NextResponse.json(
      { programRun: result.run },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
