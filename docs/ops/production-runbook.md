# Production runbook

Everything needed to put `main` live and to find out what is wrong when it is
not. Written for the current operating shape: **no outbound email** (SES is
still sandboxed) and **no Google sign-in**, so accounts are created by an
operator and credentials handed over out of band.

- [Going live](#going-live)
- [Creating accounts without email](#creating-accounts-without-email)
- [Where everything is](#where-everything-is)
- [Something is broken — where to look](#something-is-broken--where-to-look)
- [Routine operations](#routine-operations)

---

## Going live

`main` deploys to production automatically (`.github/workflows/deploy-aws.yml`).
The steps below are what has to exist first — the workflow assumes the stack is
already there and only replaces images.

### 1. Create the stack

```bash
terraform -chdir=infra/aws/terraform/backend apply
```

Put the resulting bucket name into the `backend "s3"` block of
`infra/aws/terraform/envs/production/main.tf`, then:

```bash
cp infra/aws/terraform/envs/production/terraform.tfvars.example infra/aws/terraform/envs/production/terraform.tfvars
```

Fill it in. Three values are required and each one breaks something specific if
wrong — the variable descriptions in `main.tf` say what:

| Value             | Consequence of getting it wrong                                         |
| ----------------- | ----------------------------------------------------------------------- |
| `public_base_url` | OAuth redirects fail with `redirect_uri_mismatch`; web/mcp exit at boot |
| `certificate_arn` | ALB answers every request with the port-80 "use HTTPS" refusal          |
| `alarm_email`     | Alarms fire into an SNS topic with no subscribers                       |

Then `terraform -chdir=infra/aws/terraform/envs/production apply`.

### 2. Write the secret values

Terraform creates the Secrets Manager entries but deliberately not their
contents. ECS injects these into the containers; they never appear in a task
definition.

```bash
aws secretsmanager put-secret-value --secret-id ai-catalyst-production/database-url \
  --secret-string 'postgresql://ai_catalyst:<password>@<rds-endpoint>:5432/ai_catalyst?sslmode=require&uselibpqcompat=true'

aws secretsmanager put-secret-value --secret-id ai-catalyst-production/better-auth-secret \
  --secret-string "$(openssl rand -base64 32)"

RDS Postgres 17 rejects unencrypted clients (`no pg_hba.conf entry … no
encryption`). `sslmode=require` is mandatory. Current `node-postgres` treats
`require` as `verify-full`, which fails on the Amazon RDS CA (`self-signed
certificate in certificate chain`); `uselibpqcompat=true` restores libpq's
encrypt-without-verify behaviour. Staging's `database-url` already uses both
query parameters.
```

`better-auth-secret` signs every session cookie. Changing it later signs
everyone out.

### 3. Set the Actions variables

`deploy-aws.yml` reads infrastructure ids from GitHub Actions **variables**,
scoped to the GitHub Environment (`production` for `main`, `staging` for
`develop`), rather than hardcoding them. Print them:

```bash
terraform -chdir=infra/aws/terraform/envs/production output
```

Set four per environment, under Settings → Environments → _name_ → Variables:

| Variable                | From                    | Notes                                                                        |
| ----------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `ECS_CLUSTER`           | `ecs_cluster_name`      |                                                                              |
| `PRIVATE_SUBNET_IDS`    | `private_subnet_ids`    | Comma-separated, no spaces                                                   |
| `ECS_SECURITY_GROUP_ID` | `ecs_security_group_id` |                                                                              |
| `ASSIGN_PUBLIC_IP`      | —                       | `DISABLED` for private subnets (they reach ECR via NAT); `ENABLED` in public |

> **Staging needs these too.** The workflow used to hardcode staging's ids, and
> the next `develop` deploy fails with `Missing Actions variables` until they are
> set. The values it previously used were `ECS_CLUSTER=ai-catalyst-staging`,
> `PRIVATE_SUBNET_IDS=subnet-07b302fc84ea32325,subnet-0463eda6ac077e977`,
> `ECS_SECURITY_GROUP_ID=sg-0e0aad4d80002be63`, `ASSIGN_PUBLIC_IP=ENABLED`.

Optional, repository-wide: `NEXT_PUBLIC_SENTRY_DSN` for browser error reporting.
It is a Docker build arg because Next.js inlines `NEXT_PUBLIC_*` at build time —
a task-definition variable can never reach the browser bundle.

### 4. Require a reviewer on the production environment

Settings → Environments → `production` → Required reviewers. Without this,
merging to `main` and deploying to production are the same click.

### 5. DNS

Point `public_base_url`'s hostname at the ALB (`alb_dns_name`), as an ALIAS/CNAME.
It must match the certificate and `public_base_url` exactly — scheme, apex vs
`www`, no trailing slash.

### 6. Confirm the alarm subscription

AWS emails `alarm_email` a confirmation link. Until someone clicks it, nothing is
delivered.

### 7. Deploy

Merge `develop` → `main`. The workflow builds images, registers task definitions,
runs migrations and the content seed, then updates the services.

### 8. Create the first admin

See below. Nothing can invite the first admin, so it is created directly.

### Go-live checklist

- [ ] `terraform apply` clean in `envs/production`
- [ ] `database-url` and `better-auth-secret` written to Secrets Manager
- [ ] Four Actions variables set on the `production` environment
- [ ] Four Actions variables set on the `staging` environment (or `develop` deploys break)
- [ ] Required reviewer on the `production` environment
- [ ] DNS resolves to the ALB and HTTPS serves a valid certificate
- [ ] Alarm email subscription confirmed
- [ ] `main` deploy green; `/api/health` returns `{"status":"ok"}`
- [ ] First admin account created (`--print-password`) and its password changed
- [ ] Module reset button **absent** on a module page (proves `APP_ENV=production`)
- [ ] One test founder created, signs in, dashboard loads

That second-to-last box matters more than it looks. See
[the reset tool](#why-app_env-matters) below.

---

## Creating accounts without email

There is no self-serve sign-up worth using while email is unavailable: no
address verification and no password recovery. Accounts are created by an
operator instead.

The command runs as a one-off ECS task on the **mcp** task definition — that
image carries the whole workspace and is already what `deploy-aws.yml` uses for
migrate and seed. The web image is a Next.js standalone bundle with no workspace
and no `tsx`.

```bash
aws ecs run-task \
  --cluster ai-catalyst-production \
  --task-definition ai-catalyst-production-mcp \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[<private-subnet-ids>],securityGroups=[<ecs-sg>],assignPublicIp=DISABLED}' \
  --overrides '{"containerOverrides":[{"name":"mcp","command":["pnpm","--filter","web","create-account","--","--email","founder@example.com"]}]}'
```

**No password is printed.** Stdout from an ECS task is CloudWatch, and a live
credential does not belong in a log group for 30 days. Issue the password from
**Admin → Users → Reset password**, which shows it in the browser, revokes
whatever came before and writes an audit event.

Confirm the task succeeded with `aws logs tail /ecs/ai-catalyst-production-mcp --since 5m`.

Locally the same command is just:

```bash
pnpm --filter web create-account -- --email founder@example.com
```

### The first admin

Nothing can reset a password before an admin exists, so this one account has to
carry its password out through the log:

```bash
# ...same run-task call, with:
#   ["pnpm","--filter","web","create-account","--","--email","you@example.com","--role","admin","--print-password"]
aws logs tail /ecs/ai-catalyst-production-mcp --since 5m
```

Sign in, change it from Account security immediately, and treat the printed one
as exposed. Every account after this uses the admin page instead.

**What it does, and why that shape:** a founder is created by issuing a real
invitation and accepting it, not by inserting rows. That path is what creates the
workspace, the default venture and the active context — an account missing them
signs in and lands on a dashboard that cannot load. It also leaves the account
flagged as still using its invitation password, so the app itself prompts the
person to replace it.

Admin accounts skip the invitation (nothing can invite the first admin) and get
the role written directly.

Hand the password over out of band. If it is lost, do not re-run the command —
use **Reset password** on the admin Users page, which is built for exactly this
and revokes the old sessions.

---

## Where everything is

Everything below is `ai-catalyst-production-*` in production and
`ai-catalyst-staging-*` in staging.

### Application logs — CloudWatch Logs

| Service   | Log group                               |
| --------- | --------------------------------------- |
| web       | `/ecs/ai-catalyst-production-web`       |
| mcp       | `/ecs/ai-catalyst-production-mcp`       |
| api       | `/ecs/ai-catalyst-production-api`       |
| gotenberg | `/ecs/ai-catalyst-production-gotenberg` |

Retention is 30 days. Lines are JSON with a stable `event` field, plus `service`,
`environment`, `release` and `level`. `release` is the git SHA of the deployed
image, so a log line identifies which deploy produced it.

Shared library code (`packages/services`) logs `service: aicatalyst-services` but
lands in whichever process hosted it — usually the `web` group.

Sensitive values are redacted by key name before writing
(`packages/observability/denied-keys.json`): passwords, tokens, cookies, and
content keys including `email` and `answer`. A field named `email` will read
`[REDACTED]`, which is why identifiers in logs are user ids.

### Audit trail — CloudWatch Logs

Account lifecycle is logged, not stored in a table. Search by `event`:

| Event                              | Meaning                              |
| ---------------------------------- | ------------------------------------ |
| `account_invitation_created`       | An invitation was issued             |
| `account_invitation_accepted`      | A `pending` account became real      |
| `account_invitation_revoked`       | An invitation was withdrawn          |
| `account_password_reset_by_admin`  | An admin issued a temporary password |
| `account_soft_deleted`             | An account lost access               |
| `account_workspace_mentor_changed` | A mentor binding changed             |

Each carries `actor_user_id` (who did it), `target_user_id` / `invitation_id`
(what it was done to) and `actor_role`. Resolve ids against the `users` and
`invitations` tables — emails are deliberately absent, since the redaction layer
would strip them anyway.

Two implications worth knowing: this trail expires with log retention, and the
absence of `account_password_reset_by_admin` after a failed reset is meaningful —
it is written only after sessions and MCP grants are actually revoked.

### AI-agent audit trail — database

MCP tool calls go to the **`mcp_tool_audit_logs` table**, not to logs: one row
per call with actor, tool name, outcome, duration and redacted metadata. This is
the durable record of what an AI assistant did on a founder's behalf.

`module_events` records module state transitions.

### Errors — Sentry

Only if `SENTRY_DSN` is set (server) and `NEXT_PUBLIC_SENTRY_DSN` was passed at
build (browser). Each event carries `environment` and `release`, so a spike is
attributable to a deploy. With no DSN, errors exist only as log lines.

### Metrics and alarms — CloudWatch

SNS topic `ai-catalyst-production-alarms` → the `alarm_email` address.

| Alarm                               | Fires when                                       |
| ----------------------------------- | ------------------------------------------------ |
| `*-web-unhealthy-hosts`             | Target group has an unhealthy target for 2 min   |
| `*-web-target-5xx`                  | >5 5xx in 5 min, only above 20 requests          |
| `*-{web,api,mcp}-cpu-high`          | CPU >85% sustained 5 min                         |
| `*-{web,api,mcp}-memory-high`       | Memory >85% sustained 5 min                      |
| `*-{web,api,mcp}-running-count-low` | Running tasks below 1                            |
| `*-db-free-storage-low`             | Free storage below 10% — **writes stop at zero** |
| `*-db-cpu-high`                     | RDS CPU >85% sustained 5 min                     |
| `*-db-connections-high`             | Connections above 80                             |

### Deploy history

GitHub Actions → _Deploy to AWS_. The image tag is the commit SHA, which is also
the `release` in logs and Sentry.

---

## Something is broken — where to look

### Start here

```bash
# Is the app answering at all?
curl -i https://<host>/api/health

# Are the services running the count they should?
aws ecs describe-services --cluster ai-catalyst-production \
  --services ai-catalyst-production-web ai-catalyst-production-mcp \
  --query 'services[].{name:serviceName,desired:desiredCount,running:runningCount,deployments:length(deployments)}'

# What has the app said in the last 15 minutes?
aws logs tail /ecs/ai-catalyst-production-web --since 15m --filter-pattern '{ $.level = "error" }'
```

### By symptom

| Symptom                                    | Most likely cause                                                          | Where to look                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Every request 400 "use HTTPS"              | `certificate_arn` empty, so no HTTPS listener exists                       | `terraform output`, ALB listeners                                          |
| 503 from the load balancer                 | No healthy targets — tasks crashing at boot                                | Target group health, then the web log group's first lines                  |
| Tasks restart in a loop right after deploy | Missing env var or secret; the app asserts at module load                  | `aws logs tail /ecs/…-web --since 10m` — look for `X is required`          |
| `CannotPullContainerError`                 | Task in a private subnet with no NAT route, or `ASSIGN_PUBLIC_IP` wrong    | `aws ecs describe-tasks` stoppedReason; VPC route table                    |
| Deploy hangs then rolls back               | Health check failing; the circuit breaker reverted it                      | The rolled-back deployment's task logs                                     |
| Sign-in fails for everyone                 | `better-auth-secret` changed, or `AUTH_ISSUER_URL` ≠ the real origin       | Secrets Manager, then task definition env                                  |
| Sign-in fails for one person               | Wrong password, or their account is `pending` / soft-deleted               | Admin Users page; `users.role`, `users.deleted_at`                         |
| Sporadic "too many requests" on sign-in    | Rate limiting on a shared bucket — `AUTH_TRUSTED_PROXIES` unset            | Task definition env                                                        |
| AI assistant cannot connect                | MCP OAuth; check discovery first                                           | `/.well-known/oauth-protected-resource` must be served by **mcp**, not web |
| MCP tool calls failing                     | `mcp_tool_failed` events                                                   | mcp log group, then `mcp_tool_audit_logs`                                  |
| Founder's dashboard will not load          | Account has no workspace/venture — created by hand rather than by the tool | `select * from workspaces where founder_user_id = …`                       |
| Artefact downloads fail                    | S3 permissions or `STORAGE_CONTAINER` wrong                                | web log group; task role policy                                            |
| Printable/PDF download fails               | Gotenberg unreachable over Cloud Map                                       | gotenberg log group; `GOTENBERG_URL`                                       |
| Everything slow, then total failure        | Database connections exhausted or disk full                                | `*-db-connections-high`, `*-db-free-storage-low`                           |

### Useful CloudWatch Insights queries

Recent errors across a service, newest first:

```
fields @timestamp, event, message, error_name, release
| filter level = "error"
| sort @timestamp desc
| limit 100
```

Who did what to accounts:

```
fields @timestamp, event, actor_user_id, target_user_id, invitation_id
| filter event like /^account_/
| sort @timestamp desc
```

Errors introduced by one deploy:

```
fields @timestamp, event, message
| filter level = "error" and release = "<git-sha>"
| stats count() by event
```

Unhandled server-action failures (the catch-all in `apps/web/lib/actions`):

```
fields @timestamp, message, error_name
| filter event = "web_unhandled_action_error"
| sort @timestamp desc
```

### Why `APP_ENV` matters

`isModuleResetAllowed` (`packages/services/src/module/reset-allowed.ts`)
allow-lists `local` / `development` / `test` / `staging`. Anything else —
including `production`, including a typo, including the variable going missing —
withholds a Founder-facing button that **permanently deletes** that Founder's
attempts, answers, artefacts and prep material, along with every module after it
in the run.

The allow-list means a lost variable fails safe. It also means staging must set
`APP_ENV=staging` explicitly or testers lose the tool. Checking that the button
is absent in production is the cheapest confirmation that the task definition
carries the right environment.

---

## Routine operations

### Roll back a bad deploy

The circuit breaker reverts a deploy whose tasks never pass their health check.
For a deploy that is healthy but wrong, redeploy the previous commit: re-run the
older _Deploy to AWS_ workflow run, or revert the merge on `main`.

Migrations do not roll back. A revert restores the code, not the schema.

### Reset someone's password

Admin → Users → **Reset password**. Shows a temporary password once, invalidates
the old one, signs them out everywhere and disconnects their AI assistant. Logs
`account_password_reset_by_admin`.

### Take away access

Admin → Users → **Delete**. Soft-delete: sessions are dropped by a database
trigger, mentor bindings are cleared and founder workspaces archived. Logs
`account_soft_deleted`.

### Read the database

RDS is in private subnets with no public address. Reach it from a one-off ECS
task in the same VPC:

```bash
aws ecs run-task --cluster ai-catalyst-production \
  --task-definition ai-catalyst-production-mcp --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[<private-subnet-ids>],securityGroups=[<ecs-sg>],assignPublicIp=DISABLED}' \
  --overrides '{"containerOverrides":[{"name":"mcp","command":["node","-e","…"]}]}'
```

### Restore the database

Automated backups retain 14 days with point-in-time recovery. Restoring creates a
**new instance** — restore, verify, then repoint `database-url` and redeploy.
Never restore over the live instance.

### Rotate `better-auth-secret`

Write the new value, then redeploy web and mcp. Everyone is signed out.

---

## Known gaps

Accepted for this launch shape, listed so nobody rediscovers them under
pressure:

- **No password recovery without an admin.** No SES means no reset email. An
  operator resets it from the admin page.
- **No email verification.** Addresses are confirmed by whoever creates the
  account.
- **Public registration is open.** Anyone can create a `pending` account, which
  can do nothing until invited, but it accumulates rows.
- **One task per service.** A crash is a brief outage while ECS restarts it.
  Deploys are still zero-downtime — ECS starts the replacement before stopping
  the old task.
- **One NAT gateway.** Losing its availability zone costs outbound traffic for
  tasks in the other zone.
- **Rate limiting is in memory,** per task, cleared on deploy.
- **The audit trail expires with log retention** (30 days) and is not queryable
  in the product.
- **No Terms or Privacy page.** Required before collecting data from people
  outside a pilot cohort.
- **Workbook renderers exist for Modules 1–3 only.** Modules 4–7 offer the
  Markdown artefact.
