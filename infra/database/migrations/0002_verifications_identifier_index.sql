-- Better Auth compatibility gap found by comparing 0001's baseline schema
-- against the Better Auth CLI's generated reference schema (see
-- infra/database/better-auth-schema-compatibility.md): verifications is
-- looked up by identifier on every email-verification / password-reset /
-- magic-link check, and had no supporting index.

create index verifications_identifier_idx
  on verifications (identifier);
