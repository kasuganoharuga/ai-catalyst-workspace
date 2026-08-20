/**
 * Creates a working account from the command line, for deployments with no
 * outbound email.
 *
 * This is the supported answer to "how does a person get in when SES is still
 * in the sandbox". Without it the options are the public /register page (which
 * needs the operator to invent a password and still leaves the account at role
 * `pending`) or hand-written SQL against production — the second being the thing
 * this exists to make unnecessary.
 *
 *   pnpm --filter web create-account -- --email founder@example.com
 *   pnpm --filter web create-account -- --email you@example.com --role admin
 *
 * Two modes, because the first account is a different problem from the rest:
 *
 * - `--role admin` writes the role directly. Nothing can invite the first
 *   admin, so bootstrapping has to be allowed to skip the invitation path.
 * - `--role founder` (default) goes *through* the real invitation flow —
 *   `createFounderInvitation` then `acceptInvitation` — rather than inserting
 *   rows. That path is what creates the workspace, the default venture and the
 *   active context, and it is already covered by tests. Reimplementing it here
 *   would produce accounts that differ from normally-onboarded ones in ways
 *   nobody would notice until a Founder hit an empty dashboard, which is the
 *   shape of bug that ended a manual test earlier in this project's history.
 *
 * A password is generated but **not printed** unless --print-password is passed:
 * on a deployed environment stdout is CloudWatch, and a credential does not
 * belong in a log group for 30 days. Issue one from Admin → Users → Reset
 * password instead, which shows it in the browser. The flag exists for the first
 * admin, where no such page is reachable yet.
 *
 * Against a deployed environment this runs as a one-off ECS task on the *mcp*
 * task definition, not web: the web image is a Next.js standalone bundle with
 * no workspace and no tsx, while the mcp image carries the whole workspace and
 * is already what deploy-aws.yml uses for migrate and seed. See
 * docs/ops/production-runbook.md.
 */
import path from "node:path";

import { config as loadEnv } from "dotenv";

// Must run before importing anything that reads process.env at module load —
// lib/auth.ts asserts BETTER_AUTH_SECRET and AUTH_ISSUER_URL, @ai-catalyst/db
// asserts DATABASE_URL. Hence the dynamic imports in loadDeps() rather than
// static ones, which Node would evaluate before this call. Same reason as
// scripts/seed-test-founders.ts. In a container there is no .env.local and this
// is a no-op; the values come from the task definition.
loadEnv({ path: path.resolve(__dirname, "../.env.local") });

type Role = "founder" | "admin";

interface Args {
  email: string;
  name: string;
  role: Role;
  printPassword: boolean;
}

function usage(message: string): never {
  console.error(`${message}

Usage:
  pnpm --filter web create-account -- --email <address> [--name <display name>] [--role founder|admin] [--print-password]`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };

  const email = flag("email")?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    usage("An --email is required.");
  }

  const role = (flag("role") ?? "founder") as Role;
  if (role !== "founder" && role !== "admin") {
    usage(`Unknown --role "${role}". Expected founder or admin.`);
  }

  return {
    email,
    name: flag("name")?.trim() || email,
    role,
    printPassword: argv.includes("--print-password"),
  };
}

async function loadDeps() {
  const [db, authModule, invitation, admin] = await Promise.all([
    import("@ai-catalyst/db"),
    import("../lib/auth"),
    import("@ai-catalyst/services/invitation"),
    import("@ai-catalyst/services/admin"),
  ]);
  return {
    pool: db.pool,
    auth: authModule.auth,
    createFounderInvitation: invitation.createFounderInvitation,
    acceptInvitation: invitation.acceptInvitation,
    generateTemporaryPassword: admin.generateTemporaryPassword,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

async function findLiveAdminId(deps: Deps): Promise<string | null> {
  const result = await deps.pool.query<{ id: string }>(
    `select id from users
     where role = 'admin' and deleted_at is null
     order by created_at
     limit 1`,
  );
  return result.rows[0]?.id ?? null;
}

async function main(): Promise<void> {
  const { email, name, role, printPassword } = parseArgs(process.argv.slice(2));
  const deps = await loadDeps();

  const existing = await deps.pool.query<{ id: string; role: string }>(
    "select id, role from users where email = $1",
    [email],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    // Deliberately not an upsert. Re-running this against a live account would
    // silently reset someone's password; the recovery path for that is the
    // admin Reset password button, which says what it is doing.
    throw new Error(
      `${email} already exists with role "${existing.rows[0].role}". ` +
        "To give them a new password, use Reset password in the admin Users page.",
    );
  }

  // An admin has to exist before a Founder can be invited, since the invitation
  // records who issued it. Check before creating anything so a missing admin
  // does not leave a half-made account behind.
  const adminUserId = role === "founder" ? await findLiveAdminId(deps) : null;
  if (role === "founder" && !adminUserId) {
    throw new Error(
      "No live admin account exists to issue the invitation. " +
        "Create one first: --role admin.",
    );
  }

  const password = deps.generateTemporaryPassword();

  // The real sign-up path, so the credential row and its hash are whatever this
  // version of Better Auth expects rather than this script's guess at the format.
  await deps.auth.api.signUpEmail({ body: { name, email, password } });

  const created = await deps.pool.query<{ id: string }>(
    "select id from users where email = $1",
    [email],
  );
  const userId = created.rows[0]?.id;
  if (!userId) {
    throw new Error(`Sign-up did not create a user for ${email}.`);
  }

  // Not cosmetic. Better Auth hardcodes emailVerified = false on password
  // sign-up, and implicit account linking requires a verified local row
  // (accountLinking.requireLocalEmailVerified in lib/auth.ts). Left false,
  // this account would refuse to link a Google identity on the same address
  // the day AUTH_GOOGLE_ENABLED is flipped, reporting "account not linked" —
  // which reads as a broken OAuth config, not as a decision made here. An
  // operator creating the account has confirmed the address out of band, so
  // verified is also the honest value.
  await deps.pool.query(
    "update users set email_verified = true where id = $1",
    [userId],
  );

  if (role === "admin") {
    await deps.pool.query("update users set role = 'admin' where id = $1", [
      userId,
    ]);
  } else {
    const { rawToken } = await deps.createFounderInvitation(
      { userId: adminUserId!, role: "admin" },
      { email },
    );
    // Accepted on their behalf, as the new `pending` user: this is what creates
    // the workspace, the default venture and the active context. An account
    // without them signs in and lands on a dashboard that cannot load.
    await deps.acceptInvitation({ userId, role: "pending" }, rawToken);
  }

  // The password is withheld by default, and that is the point.
  //
  // Against a deployed environment this runs as an ECS task, so stdout is
  // CloudWatch: printing here would leave a live credential in a log group for
  // its whole retention period, readable by anyone with log access.
  // apps/web/lib/email.ts refuses to boot a real environment on the noop mail
  // transport for exactly this reason — "it puts live sign-in codes in
  // CloudWatch" — and this would have walked straight into it.
  //
  // For a Founder there is a better channel already built: Admin → Users →
  // Reset password shows a fresh temporary password in the browser, revokes
  // whatever came before, and writes an audit event. So the account is created
  // here with a password nobody holds, and the operator issues one there.
  //
  // The first admin is the one case with no such channel — nothing can reset a
  // password before an admin exists — which is what --print-password is for.
  if (printPassword) {
    console.log(
      [
        "",
        `Created ${role} account.`,
        "",
        `  email:    ${email}`,
        `  password: ${password}`,
        "",
        "This password went to stdout. On a deployed environment that is",
        "CloudWatch: treat it as exposed, hand it over out of band, and have it",
        "changed from Account security immediately.",
        "",
      ].join("\n"),
    );
    return;
  }

  console.log(
    [
      "",
      `Created ${role} account for ${email}.`,
      "",
      "No password was printed, so nothing usable is in this log. Issue one from",
      "Admin → Users → Reset password, which shows it in the browser only.",
      "",
      "If this is the first admin and nobody can reach that page yet, re-run with",
      "--print-password and change it immediately after signing in.",
      "",
    ].join("\n"),
  );
}

main()
  .then(async () => {
    const { pool } = await import("@ai-catalyst/db");
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    const { pool } = await import("@ai-catalyst/db");
    await pool.end();
  });
