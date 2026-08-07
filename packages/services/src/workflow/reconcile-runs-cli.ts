import { pool } from "@ai-catalyst/db";

import { PROGRAM_CONTENT } from "../content-seed/content/program.js";
import { reconcileProgramRun } from "./internal/reconcile-run-modules.js";

// Batch front-fill for a "living" (content_lock='mutable') Program
// Version: every non-archived Program Run for it gets the same lazy
// front-fill getOrCreateProgramRun already applies on a Founder's next
// Continue Programme click (see reconcile-run-modules.ts). Two reasons
// this exists as its own CLI rather than relying purely on that lazy
// path:
//   1. A Founder who deep-links straight into a Module never goes through
//      getOrCreateProgramRun's existing-Run branch, so their Run can stay
//      un-reconciled indefinitely — this is the documented fallback.
//   2. `pnpm db:freeze`'s preflight requires EVERY Run's reconciliation
//      plan to already be empty before it will freeze — this is what you
//      run first to make that true.
function parseArgs(argv: string[]): { programKey: string; versionLabel: string } {
  const versionLabelIndex = argv.indexOf("--version-label");
  const versionLabel = versionLabelIndex !== -1 ? argv[versionLabelIndex + 1] : undefined;
  if (!versionLabel) {
    throw new Error("Usage: pnpm db:reconcile-runs -- --version-label <label> [--program-key <key>]");
  }

  const programKeyIndex = argv.indexOf("--program-key");
  const programKey =
    (programKeyIndex !== -1 ? argv[programKeyIndex + 1] : undefined) ?? PROGRAM_CONTENT.programKey;

  return { programKey, versionLabel };
}

async function run(): Promise<void> {
  const { programKey, versionLabel } = parseArgs(process.argv.slice(2));

  const versionResult = await pool.query<{ id: string; content_lock: "mutable" | "frozen" }>(
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

  console.log(`Reconciling ${runsResult.rows.length} Program Run(s) against program_version ${version.id}...`);

  let touched = 0;
  for (const row of runsResult.rows) {
    const summary = await reconcileProgramRun(row.id);
    const changed =
      summary.missingInserted + summary.titlesUpdated + summary.sequencesUpdated + summary.promoted;
    if (changed > 0) {
      touched += 1;
      console.log(
        `  Run ${row.id}: +${summary.missingInserted} module(s), ${summary.titlesUpdated} title(s), ` +
          `${summary.sequencesUpdated} sequence(s), ${summary.promoted} promotion(s) across ` +
          `${summary.branchesReconciled} branch(es).`,
      );
    }
  }

  console.log(`Done. ${touched}/${runsResult.rows.length} Run(s) needed reconciliation.`);
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
