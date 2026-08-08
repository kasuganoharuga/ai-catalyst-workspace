/**
 * One-off local helper: put module1@seed.test at Module 4 website Steps 1–2
 * with a snapshotted interview activity (no Claude attempt yet).
 *
 *   pnpm --filter web exec tsx scripts/seed-module4-demo.ts
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
  const { pool } = await import("@ai-catalyst/db");

  const user = await pool.query<{ id: string }>(
    `select id from users where email = 'module1@seed.test'`,
  );
  const userId = user.rows[0]?.id;
  if (!userId) {
    throw new Error(
      "module1@seed.test not found — run seed:test-founders first.",
    );
  }

  const ws = await pool.query<{ id: string }>(
    `select id from workspaces where founder_user_id = $1`,
    [userId],
  );
  const workspaceId = ws.rows[0]?.id;
  if (!workspaceId) throw new Error("workspace missing");

  const run = await pool.query<{
    id: string;
    program_version_id: string;
  }>(
    `select id, program_version_id from program_runs
     where workspace_id = $1 and status = 'active'
     order by created_at desc limit 1`,
    [workspaceId],
  );
  const programRun = run.rows[0];
  if (!programRun) throw new Error("active program run missing");

  const modules = await pool.query<{
    id: string;
    module_key: string;
    sequence_index: number;
    status: string;
    accepted_attempt_id: string | null;
  }>(
    `select id, module_key, sequence_index, status, accepted_attempt_id
     from program_run_modules
     where program_run_id = $1 and workspace_id = $2
     order by sequence_index`,
    [programRun.id, workspaceId],
  );

  const client = await pool.connect();
  try {
    await client.query("begin");

    // Complete modules 0–3 if needed; unlock module 4.
    for (const mod of modules.rows) {
      if (mod.sequence_index <= 3 && mod.status !== "completed") {
        // Ensure an accepted attempt exists for M3 (activity FK).
        let attemptId = mod.accepted_attempt_id;
        if (!attemptId && mod.module_key === "module-03-problem-statement") {
          const inserted = await client.query<{ id: string }>(
            `insert into module_attempts (
               workspace_id, program_run_module_id, attempt_number, attempt_type,
               status, started_by_user_id, started_via, accepted_by_user_id, accepted_at
             ) values ($1, $2, 1, 'initial', 'accepted', $3, 'website', $3, now())
             returning id`,
            [workspaceId, mod.id, userId],
          );
          attemptId = inserted.rows[0]!.id;
        }

        await client.query(
          `update program_run_modules
           set status = 'completed',
               completed_at = coalesce(completed_at, now()),
               completed_by_user_id = coalesce(completed_by_user_id, $3),
               accepted_attempt_id = coalesce(accepted_attempt_id, $4),
               active_attempt_id = null,
               unlocked_at = coalesce(unlocked_at, now()),
               started_at = coalesce(started_at, now()),
               updated_at = now()
           where id = $1 and workspace_id = $2`,
          [mod.id, workspaceId, userId, attemptId],
        );
      }

      if (mod.module_key === "module-04-evidence-of-unmet-need") {
        await client.query(
          `update program_run_modules
           set status = 'available',
               unlocked_at = coalesce(unlocked_at, now()),
               updated_at = now()
           where id = $1 and workspace_id = $2`,
          [mod.id, workspaceId],
        );
      }
    }

    const m3 = modules.rows.find(
      (m) => m.module_key === "module-03-problem-statement",
    );
    const m3Attempt = await client.query<{ id: string }>(
      `select accepted_attempt_id as id from program_run_modules where id = $1`,
      [m3!.id],
    );
    let sourceAttemptId = m3Attempt.rows[0]?.id;
    if (!sourceAttemptId) {
      const inserted = await client.query<{ id: string }>(
        `insert into module_attempts (
           workspace_id, program_run_module_id, attempt_number, attempt_type,
           status, started_by_user_id, started_via, accepted_by_user_id, accepted_at
         ) values ($1, $2, 1, 'initial', 'accepted', $3, 'website', $3, now())
         returning id`,
        [workspaceId, m3!.id, userId],
      );
      sourceAttemptId = inserted.rows[0]!.id;
      await client.query(
        `update program_run_modules
         set accepted_attempt_id = $3, status = 'completed', updated_at = now()
         where id = $1 and workspace_id = $2`,
        [m3!.id, workspaceId, sourceAttemptId],
      );
    }

    const questions = [
      { index: 1, text: "Tell me about the last time this problem showed up." },
      { index: 2, text: "What did you do when that happened?" },
      { index: 3, text: "What have you already tried to fix it?" },
      { index: 4, text: "Who else is affected when this goes wrong?" },
      {
        index: 5,
        text: "What would a good outcome look like in the next 30 days?",
      },
    ];

    await client.query(
      `insert into interview_activities (
         workspace_id, program_run_id, source_module_attempt_id, questions, evidence_status
       ) values ($1, $2, $3, $4::jsonb, 'draft')
       on conflict (program_run_id) do update
         set questions = excluded.questions,
             evidence_status = 'draft',
             evidence_confirmed_at = null,
             confirmed_markdown = null,
             confirmed_source_record_ids = '[]'::jsonb,
             updated_at = now()`,
      [workspaceId, programRun.id, sourceAttemptId, JSON.stringify(questions)],
    );

    await client.query("commit");
    console.log(
      "Ready: sign in as module1@seed.test / TestFounder!2026 and open Module 4.",
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
