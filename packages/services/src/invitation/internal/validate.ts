import { ServiceError } from "@ai-catalyst/services/errors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// randomBytes(32).toString("base64url") always produces exactly 43
// characters (256 bits, no padding) — anchoring the length catches
// corrupted/truncated tokens before they ever reach a database query.
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Runtime validation of untrusted JSON input at the API boundary.
export function validateCreateInvitationInput(
  input: unknown,
): asserts input is { email: string; personalMessage?: string } {
  if (
    typeof input !== "object" ||
    input === null ||
    !("email" in input) ||
    typeof (input as { email: unknown }).email !== "string"
  ) {
    throw new ServiceError("VALIDATION_ERROR", "Email must be a string.");
  }

  const { email, personalMessage } = input as {
    email: string;
    personalMessage?: unknown;
  };

  const trimmed = email.trim();
  if (trimmed.length === 0 || !trimmed.includes("@") || trimmed.length > 320) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Email must be a valid address.",
    );
  }

  if (
    personalMessage !== undefined &&
    (typeof personalMessage !== "string" || personalMessage.length > 2000)
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Personal message must be a string of at most 2000 characters.",
    );
  }
}

export function assertValidInvitationId(invitationId: string): void {
  if (!UUID_PATTERN.test(invitationId)) {
    throw new ServiceError("VALIDATION_ERROR", "Invitation ID is invalid.");
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Trim pasted tokens before format check and hash lookup.
export function normalizeAndValidateInvitationToken(rawToken: unknown): string {
  if (typeof rawToken !== "string") {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Invitation token must be a string.",
    );
  }

  const token = rawToken.trim();
  if (!INVITATION_TOKEN_PATTERN.test(token)) {
    throw new ServiceError("VALIDATION_ERROR", "Invitation token is invalid.");
  }

  return token;
}
