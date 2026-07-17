import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ModuleCatalogArtifact,
  ModuleCatalogEntry,
  ModuleCompletionMode,
  ModuleType,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
// Imports the Program's content constant directly rather than the whole
// content-seed module (which also pulls in its DB reconciliation/publish
// logic) — content-seed is only meant for the seed CLI and its own tests,
// not for a read path consumed by apps/web.
import { PROGRAM_CONTENT } from "@ai-catalyst/services/content-seed/content/program";
import { resolvePublishedProgramVersionId } from "@ai-catalyst/services/internal/program-version";

// The catalog always resolves against this Program's current published
// version — this is deliberately not the same concept as the fixed
// program_version_id a Run binds to at creation time (see
// program_run_modules): a Run stays on the version it started with even
// after a newer version publishes, while the catalog always reflects
// whatever is published right now.
const V1_PROGRAM_KEY = PROGRAM_CONTENT.programKey;

export interface ModuleCatalogDependencies {
  // Test-only seam: production always resolves the real V1 Program.
  // Lets tests exercise NOT_FOUND / multi-version-selection against an
  // isolated fixture Program without ever touching the real seeded rows.
  programKey?: string;
}

interface ModuleCatalogRow {
  module_key: string;
  sequence_index: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  objective: string | null;
  module_type: ModuleType;
  completion_mode: ModuleCompletionMode;
  estimated_minutes: number | null;
  module_status: "draft" | "active" | "archived";
  expected_artifacts: ModuleCatalogArtifact[];
}

function mapRow(row: ModuleCatalogRow): ModuleCatalogEntry {
  return {
    moduleKey: row.module_key,
    sequenceIndex: row.sequence_index,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    objective: row.objective,
    moduleType: row.module_type,
    completionMode: row.completion_mode,
    estimatedMinutes: row.estimated_minutes,
    catalogStatus: row.module_status === "active" ? "live" : "coming_soon",
    expectedArtifacts: row.expected_artifacts,
  };
}

// `left join` + `jsonb_agg` instead of a plain join: a Module with more
// than one Artifact Definition (e.g. multiple outputs) must still produce
// exactly one row here, or the catalog would render it as duplicate cards.
// The `filter (where ad.id is not null)` keeps a Module with zero
// artifacts as `[]` rather than a one-element array containing nulls.
const CATALOG_QUERY = `
  select
    md.module_key,
    md.sequence_index,
    md.title,
    md.subtitle,
    md.description,
    md.objective,
    md.module_type,
    md.completion_mode,
    md.estimated_minutes,
    md.status as module_status,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'artifactKey', ad.artifact_key,
          'name', ad.name,
          'requiredFilename', ad.required_filename
        )
        order by ad.sequence_index
      ) filter (where ad.id is not null),
      '[]'::jsonb
    ) as expected_artifacts
  from module_definitions md
  left join artifact_definitions ad on ad.module_definition_id = md.id
  where md.program_version_id = $1
    and md.status <> 'archived'
`;

export async function listModuleCatalog(
  actor: ActorContext,
  deps: ModuleCatalogDependencies = {},
): Promise<ModuleCatalogEntry[]> {
  assertRole(actor, ["founder"]);

  const programVersionId = await resolvePublishedProgramVersionId(
    deps.programKey ?? V1_PROGRAM_KEY,
  );

  const result = await pool.query<ModuleCatalogRow>(
    `${CATALOG_QUERY}
     group by md.id
     order by md.sequence_index`,
    [programVersionId],
  );

  return result.rows.map(mapRow);
}

export async function getModuleCatalogEntry(
  actor: ActorContext,
  moduleKey: string,
  deps: ModuleCatalogDependencies = {},
): Promise<ModuleCatalogEntry> {
  assertRole(actor, ["founder"]);

  const programVersionId = await resolvePublishedProgramVersionId(
    deps.programKey ?? V1_PROGRAM_KEY,
  );

  const result = await pool.query<ModuleCatalogRow>(
    `${CATALOG_QUERY}
       and md.module_key = $2
     group by md.id`,
    [programVersionId, moduleKey],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ServiceError("NOT_FOUND", `Module "${moduleKey}" not found.`);
  }

  return mapRow(row);
}
