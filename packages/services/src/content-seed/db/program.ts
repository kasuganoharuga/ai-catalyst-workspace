import type { PoolClient } from "pg";

import { diffFields } from "../compare.js";
import { ContentSeedError } from "../errors.js";
import type { ContentLock, ProgramContent } from "../types.js";

export type ProgramVersionStatus = "draft" | "published" | "retired";

interface ProgramVersionRow {
  id: string;
  version_number: number;
  name: string;
  description: string | null;
  release_notes: string | null;
  status: ProgramVersionStatus;
  content_lock: ContentLock;
}

export interface ReconciledProgram {
  programId: string;
  programVersionId: string;
  programVersionStatus: ProgramVersionStatus;
  contentLock: ContentLock;
}

// The database's own content_lock is authoritative for whether an
// *existing* program_version's content may be edited in place —
// ProgramContent.contentLock only decides the initial value written when
// the row is first created (see upsertProgramVersion's INSERT branch).
// Shared with content-seed/index.ts, which applies the same formula to
// decide whether Modules/Questions/Artifacts/Bindings are editable.
export function isProgramVersionContentEditable(
  row: Pick<ProgramVersionRow, "status" | "content_lock">,
): boolean {
  return (
    row.status === "draft" ||
    (row.status === "published" && row.content_lock === "mutable")
  );
}

// Cross-checks the content constant's contentLock against the database's
// actual content_lock for an existing row. Four quadrants:
//
//   DB       | constant | outcome
//   ---------|----------|----------------------------------------------
//   mutable  | mutable  | editable (isProgramVersionContentEditable
//            |          | handles the rest)
//   mutable  | frozen   | ERROR — only `pnpm db:freeze` may move
//            |          | mutable -> frozen; this seed script never does
//   frozen   | mutable  | allowed, read-only: exact match -> no-op,
//            |          | diff -> PUBLISHED_CONTENT_MISMATCH below
//   frozen   | frozen   | normal frozen
//
// Only the second row is a real inconsistency. "Frozen in the DB, mutable
// in the constant" (row 3) is the *ordinary* state right after
// `db:freeze`, before someone gets around to bumping the constant for
// V2 — it must not be an error, or freezing immediately breaks the very
// next unchanged `pnpm db:seed`.
function assertContentLockDirectionValid(
  row: Pick<ProgramVersionRow, "content_lock">,
  content: ProgramContent,
): void {
  if (row.content_lock === "mutable" && content.contentLock === "frozen") {
    throw new ContentSeedError(
      "CONTENT_LOCK_FREEZE_VIA_SEED_FORBIDDEN",
      `program_version's content_lock is "mutable" in the database but the content constants say ` +
        `"frozen". Seed can never freeze content — run "pnpm db:freeze" instead.`,
    );
  }
}

async function upsertProgram(
  client: PoolClient,
  content: ProgramContent,
): Promise<string> {
  const existing = await client.query<{
    id: string;
    name: string;
    description: string | null;
  }>(`select id, name, description from programs where program_key = $1`, [
    content.programKey,
  ]);

  const row = existing.rows[0];
  if (row) {
    const differing = diffFields(
      { name: content.programName, description: content.programDescription },
      { name: row.name, description: row.description },
      ["name", "description"],
    );
    if (differing.length > 0) {
      throw new ContentSeedError(
        "PUBLISHED_CONTENT_MISMATCH",
        `Program "${content.programKey}" already exists with a different ${differing.join("/")} than the content constants. ` +
          "Update the content constants to match, or fix the database row directly — this seed script never overwrites a Program's identity fields.",
      );
    }
    return row.id;
  }

  const inserted = await client.query<{ id: string }>(
    `insert into programs (program_key, name, description)
     values ($1, $2, $3)
     returning id`,
    [content.programKey, content.programName, content.programDescription],
  );
  return inserted.rows[0].id;
}

// Draft content, and published+mutable ("living V1") content, may be
// corrected in place; published+frozen/retired content must match
// exactly, or the run is rejected rather than silently rewritten.
async function upsertProgramVersion(
  client: PoolClient,
  programId: string,
  content: ProgramContent,
): Promise<ProgramVersionRow> {
  const existing = await client.query<ProgramVersionRow>(
    `select id, version_number, name, description, release_notes, status, content_lock
     from program_versions
     where program_id = $1 and version_label = $2`,
    [programId, content.versionLabel],
  );

  const row = existing.rows[0];
  if (!row) {
    // content_lock is written only here, on first creation of this row —
    // reconcileProgram never writes it again afterwards. Moving an
    // existing row from mutable to frozen is exclusively db:freeze's job.
    const inserted = await client.query<ProgramVersionRow>(
      `insert into program_versions
         (program_id, version_number, version_label, name, description, release_notes, content_lock)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, version_number, name, description, release_notes, status, content_lock`,
      [
        programId,
        content.versionNumber,
        content.versionLabel,
        content.versionName,
        content.versionDescription,
        content.releaseNotes,
        content.contentLock,
      ],
    );
    return inserted.rows[0];
  }

  if (row.status === "retired") {
    throw new ContentSeedError(
      "CONTENT_ALREADY_RETIRED",
      `program_version "${content.versionLabel}" is retired and can no longer be the target of this seed script.`,
    );
  }

  if (row.version_number !== content.versionNumber) {
    throw new ContentSeedError(
      "PUBLISHED_CONTENT_MISMATCH",
      `program_version "${content.versionLabel}" already exists with version_number=${row.version_number}, ` +
        `but the content constants specify ${content.versionNumber}. version_number is fixed once created.`,
    );
  }

  assertContentLockDirectionValid(row, content);

  const differing = diffFields(
    {
      name: content.versionName,
      description: content.versionDescription,
      release_notes: content.releaseNotes,
    },
    {
      name: row.name,
      description: row.description,
      release_notes: row.release_notes,
    },
    ["name", "description", "release_notes"],
  );

  if (differing.length === 0) {
    return row;
  }

  if (!isProgramVersionContentEditable(row)) {
    throw new ContentSeedError(
      "PUBLISHED_CONTENT_MISMATCH",
      `program_version "${content.versionLabel}" is already published and its ${differing.join("/")} ` +
        "no longer matches the content constants. Publish a new program_version instead of editing a published one.",
    );
  }

  const updated = await client.query<ProgramVersionRow>(
    `update program_versions
     set name = $1, description = $2, release_notes = $3
     where id = $4
     returning id, version_number, name, description, release_notes, status, content_lock`,
    [
      content.versionName,
      content.versionDescription,
      content.releaseNotes,
      row.id,
    ],
  );
  return updated.rows[0];
}

export async function reconcileProgram(
  client: PoolClient,
  content: ProgramContent,
): Promise<ReconciledProgram> {
  const programId = await upsertProgram(client, content);
  const versionRow = await upsertProgramVersion(client, programId, content);
  return {
    programId,
    programVersionId: versionRow.id,
    programVersionStatus: versionRow.status,
    contentLock: versionRow.content_lock,
  };
}
