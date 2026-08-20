import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";

/**
 * Shallow liveness for the ALB. Do not probe DB / S3 / MCP / Claude here —
 * a dependency blip must not drain healthy web tasks.
 */
export function GET(): Response {
  return Response.json({
    status: "ok",
    service: SERVICE_NAMES.web,
  });
}
