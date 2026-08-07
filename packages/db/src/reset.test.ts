import { describe, expect, it } from "vitest";

import { assertResetGates } from "./reset.js";

// Pure guard-logic tests only — this file never lets execution reach
// reset.ts's actual `drop schema` statement (that code path only runs
// inside `run()`, which this suite never calls). The whole point of
// exporting assertResetGates separately is so these gates can be proven
// correct without ever connecting to a real database, let alone wiping one.

const STAGING_URL = "postgresql://ai_catalyst:secret@staging-db.example.com:5432/ai_catalyst";

describe("assertResetGates", () => {
  it("refuses without ALLOW_DESTRUCTIVE_DB_RESET=1", () => {
    expect(() =>
      assertResetGates(["--confirm-database", "ai_catalyst"], {}, STAGING_URL),
    ).toThrow(/ALLOW_DESTRUCTIVE_DB_RESET/);
  });

  it("refuses ALLOW_DESTRUCTIVE_DB_RESET set to anything other than the string '1'", () => {
    expect(() =>
      assertResetGates(
        ["--confirm-database", "ai_catalyst"],
        { ALLOW_DESTRUCTIVE_DB_RESET: "true" },
        STAGING_URL,
      ),
    ).toThrow(/ALLOW_DESTRUCTIVE_DB_RESET/);
  });

  it("refuses when the database name matches /prod/i", () => {
    expect(() =>
      assertResetGates(
        ["--confirm-database", "ai_catalyst_prod"],
        { ALLOW_DESTRUCTIVE_DB_RESET: "1" },
        "postgresql://user:pass@host:5432/ai_catalyst_prod",
      ),
    ).toThrow(/prod/i);
  });

  it("refuses when the connection string's HOST matches /prod/i even if the database name doesn't", () => {
    expect(() =>
      assertResetGates(
        ["--confirm-database", "ai_catalyst"],
        { ALLOW_DESTRUCTIVE_DB_RESET: "1" },
        "postgresql://ai_catalyst:secret@production-cluster.example.com:5432/ai_catalyst",
      ),
    ).toThrow(/prod/i);
  });

  it("refuses without --confirm-database", () => {
    expect(() => assertResetGates([], { ALLOW_DESTRUCTIVE_DB_RESET: "1" }, STAGING_URL)).toThrow(
      /confirm-database/,
    );
  });

  it("refuses when --confirm-database does not exactly match the parsed database name", () => {
    expect(() =>
      assertResetGates(
        ["--confirm-database", "wrong_name"],
        { ALLOW_DESTRUCTIVE_DB_RESET: "1" },
        STAGING_URL,
      ),
    ).toThrow(/does not exactly match/);
  });

  it("refuses a case-mismatched --confirm-database (exact match only, not case-insensitive)", () => {
    expect(() =>
      assertResetGates(
        ["--confirm-database", "AI_CATALYST"],
        { ALLOW_DESTRUCTIVE_DB_RESET: "1" },
        STAGING_URL,
      ),
    ).toThrow(/does not exactly match/);
  });

  it("passes when every gate is satisfied", () => {
    const result = assertResetGates(
      ["--confirm-database", "ai_catalyst"],
      { ALLOW_DESTRUCTIVE_DB_RESET: "1" },
      STAGING_URL,
    );
    expect(result).toEqual({ databaseName: "ai_catalyst" });
  });

  it("throws a clear error when DATABASE_URL has no parseable database name", () => {
    expect(() =>
      assertResetGates(
        ["--confirm-database", "x"],
        { ALLOW_DESTRUCTIVE_DB_RESET: "1" },
        "postgresql://user:pass@host:5432/",
      ),
    ).toThrow(/database name/);
  });
});
