import { pool } from "@ai-catalyst/db";

import { PROGRAM_CONTENT } from "../content-seed/content/program.js";
import { reconcileProgramRun } from "./internal/reconcile-run-modules.js";

// Batch front-fill for mutable program_versions — lazy Continue Programme
// reconciliation misses deep-link-only Runs; db:freeze preflight requires
// every Run's plan empty first.
function parseArgs(argv: string[]): {
  programKey: string;
  versionLabel: string;
} {
  const versionLabelIndex = argv.indexOf("--version-label");
  const versionLabel =
    versionLabelIndex !== -1 ? argv[versionLabelIndex + 1] : undefined;
  if (!versionLabel) {
    throw new Error(
      "Usage: pnpm db:reconcile-runs -- --version-label <label> [--program-key <key>]",
    );
  }

  const programKeyIndex = argv.indexOf("--program-key");
  const programKey =
    (programKeyIndex !== -1 ? argv[programKeyIndex + 1] : undefined) ??
    PROGRAM_CONTENT.programKey;

  return { programKey, versionLabel };
}

async function run(): Promise<void> {
  const { programKey, versionLabel } = parseArgs(process.argv.slice(2));

  const versionResult = await pool.query<{
    id: string;
    content_lock: "mutable" | "frozen";
  }>(
    `select pv.id, pv.content_lock
     from program_versions pv
     join programs p on p.id = pv.program_id
     where p.program_key = $1 and pv.version_label = $2`,
    [programKey, versionLabel],
  );
  const version = versionResult.rows[0];
  if (!version) {
    throw new Error(
      `No program_version found for program_key="${programKey}" version_label="${versionLabel}".`,
    );
  }
  if (version.content_lock !== "mutable") {
    console.log(
      `program_version ${version.id} is content_lock=${version.content_lock} — nothing to reconcile ` +
        "(reconciliation only applies to a living, mutable program_version).",
    );
    return;
  }

  const runsResult = await pool.query<{ id: string }>(
    `select id from program_runs where program_version_id = $1 and status <> 'archived'`,
    [version.id],
  );

  console.log(
    `Reconciling ${runsResult.rows.length} Program Run(s) against program_version ${version.id}...`,
  );

  let touched = 0;
  for (const row of runsResult.rows) {
    const summary = await reconcileProgramRun(row.id);
    const changed =
      summary.missingInserted +
      summary.titlesUpdated +
      summary.sequencesUpdated +
      summary.promoted;
    if (changed > 0) {
      touched += 1;
      console.log(
        `  Run ${row.id}: +${summary.missingInserted} module(s), ${summary.titlesUpdated} title(s), ` +
          `${summary.sequencesUpdated} sequence(s), ${summary.promoted} promotion(s) across ` +
          `${summary.branchesReconciled} branch(es).`,
      );
    }
  }

  console.log(
    `Done. ${touched}/${runsResult.rows.length} Run(s) needed reconciliation.`,
  );
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
