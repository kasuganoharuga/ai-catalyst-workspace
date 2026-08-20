import { Pool } from "pg";

import { DEFAULT_TOOLKIT_CONTENT } from "./content/index.js";
import { freezeProgramVersion } from "./db/freeze.js";

// freeze is a one-way door (see freeze.ts's own doc comment): once a
// program_version is frozen, only a database reset can undo it — there is
// no "unfreeze". Every gate below exists to make that irreversibility
// something the operator deliberately opted into, not something that
// happened because a script ran on the wrong database or the wrong
// version by accident.
function assertGates(
  argv: string[],
  env: NodeJS.ProcessEnv,
): { versionLabel: string; allowSharedPromptFreeze: boolean } {
  if (env.ALLOW_CONTENT_FREEZE !== "1") {
    throw new Error(
      "Refusing to freeze: set ALLOW_CONTENT_FREEZE=1 to confirm you intend to run this against this database.",
    );
  }
  if (!argv.includes("--confirm")) {
    throw new Error(
      "Refusing to freeze: pass --confirm to confirm this is a deliberate, one-way action.",
    );
  }

  const versionLabelIndex = argv.indexOf("--version-label");
  const versionLabel =
    versionLabelIndex !== -1 ? argv[versionLabelIndex + 1] : undefined;
  if (!versionLabel) {
    throw new Error(
      "Usage: ALLOW_CONTENT_FREEZE=1 pnpm db:freeze -- --version-label <label> --confirm [--allow-shared-prompt-freeze]",
    );
  }
  // Must match the CONSTANTS' own versionLabel exactly — a mistyped or
  // stale label here would otherwise freeze whatever program_version
  // happens to match a typo, not the one the operator meant.
  if (versionLabel !== DEFAULT_TOOLKIT_CONTENT.program.versionLabel) {
    throw new Error(
      `Refusing to freeze: --version-label "${versionLabel}" does not match the content constants' own ` +
        `versionLabel "${DEFAULT_TOOLKIT_CONTENT.program.versionLabel}". Freeze always targets the ` +
        "program_version the current content constants describe — update the constants first if you " +
        "meant a different one.",
    );
  }

  return {
    versionLabel,
    allowSharedPromptFreeze: argv.includes("--allow-shared-prompt-freeze"),
  };
}

function printV2Runbook(versionLabel: string): void {
  console.log(
    [
      "",
      `Next steps to start a new content version after ${versionLabel}:`,
      "  1. content/program.ts  -> bump versionNumber, pick a new versionLabel.",
      '     Set contentLock: "mutable" for another living version, or "frozen" for a fixed one-shot release.',
      "  2. content/prompts.ts  -> for every prompt whose CONTENT you're about to change,",
      "     bump its versionNumber too (the frozen version's content_lock is now immutable —",
      "     seeding a content change against it without a version bump fails with PUBLISHED_CONTENT_MISMATCH).",
      "     A prompt whose content is NOT changing may keep reusing its already-frozen version as-is.",
      "  3. If the new version is itself meant to stay living, every prompt you expect to keep editing",
      "     must be a NEW prompt_version (new versionNumber) — a frozen prompt_version stays frozen even",
      "     if the program_version that reuses it unchanged is mutable.",
      "  4. pnpm db:seed",
      "",
      "Existing Program Runs stay bound to the version just frozen and will not follow further edits —",
      "reconcileRunModules is a permanent no-op against it from now on.",
    ].join("\n"),
  );
}

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const { versionLabel, allowSharedPromptFreeze } = assertGates(
    process.argv.slice(2),
    process.env,
  );

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await freezeProgramVersion(client, {
      content: DEFAULT_TOOLKIT_CONTENT,
      allowSharedPromptFreeze,
    });
    await client.query("commit");

    console.log(
      `Frozen program_version ${result.programVersionId} (${result.versionLabel}).`,
    );
    if (result.frozenPromptVersions.length > 0) {
      console.log(
        `Frozen ${result.frozenPromptVersions.length} prompt_version(s):`,
      );
      for (const prompt of result.frozenPromptVersions) {
        console.log(`  ${prompt.promptKey} v${prompt.versionNumber}`);
      }
    } else {
      console.log(
        "No prompt_versions needed freezing (none were still mutable).",
      );
    }
    printV2Runbook(versionLabel);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
