import type { PoolClient } from "pg";

import { diffFields } from "../compare.js";
import { ContentSeedError } from "../errors.js";
import type { ProgramContent } from "../types.js";

export type ProgramVersionStatus = "draft" | "published" | "retired";

interface ProgramVersionRow {
  id: string;
  version_number: number;
  name: string;
  description: string | null;
  release_notes: string | null;
  status: ProgramVersionStatus;
}

export interface ReconciledProgram {
  programId: string;
  programVersionId: string;
  programVersionStatus: ProgramVersionStatus;
}

async function upsertProgram(client: PoolClient, content: ProgramContent): Promise<string> {
  const existing = await client.query<{ id: string; name: string; description: string | null }>(
    `select id, name, description from programs where program_key = $1`,
    [content.programKey],
  );

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

// Draft content may be corrected in place; published/retired content must
// match exactly, or the run is rejected rather than silently rewritten.
async function upsertProgramVersion(
  client: PoolClient,
  programId: string,
  content: ProgramContent,
): Promise<ProgramVersionRow> {
  const existing = await client.query<ProgramVersionRow>(
    `select id, version_number, name, description, release_notes, status
     from program_versions
     where program_id = $1 and version_label = $2`,
    [programId, content.versionLabel],
  );

  const row = existing.rows[0];
  if (!row) {
    const inserted = await client.query<ProgramVersionRow>(
      `insert into program_versions (program_id, version_number, version_label, name, description, release_notes)
       values ($1, $2, $3, $4, $5, $6)
       returning id, version_number, name, description, release_notes, status`,
      [
        programId,
        content.versionNumber,
        content.versionLabel,
        content.versionName,
        content.versionDescription,
        content.releaseNotes,
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

  const differing = diffFields(
    {
      name: content.versionName,
      description: content.versionDescription,
      release_notes: content.releaseNotes,
    },
    { name: row.name, description: row.description, release_notes: row.release_notes },
    ["name", "description", "release_notes"],
  );

  if (differing.length === 0) {
    return row;
  }

  if (row.status === "published") {
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
     returning id, version_number, name, description, release_notes, status`,
    [content.versionName, content.versionDescription, content.releaseNotes, row.id],
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
  };
}
