# AWS infrastructure

Staging readiness on AWS. The previous AWS production environment has been
retired; this tree only describes the staging stack. **Do not `terraform apply`
from this prep alone** — live cutover is a separate, documented apply, and the
Terraform modules are still not a perfect mirror of the running staging
resources (short container names, Secrets Manager `secrets` blocks, HTTPS
listener). Prefer the live staging shape over the modules until they are
aligned.

## Architecture

```text
Developer
   → GitHub (develop = Staging)
   → Actions (deploy-aws.yml on push to develop)
   → ECR (web / api / mcp)
   → ECS Fargate
   → ALB (HTTPS)
        → Web (:3000)
        → MCP (:8787)
   → private: API (:8000), Gotenberg (:3000 via Cloud Map),
              RDS Postgres (inside staging VPC)
   → S3 (artifacts), SES (email), Secrets Manager
```

Printable PDF downloads (`?format=workbook`) call Gotenberg from the web
task. Staging wires `GOTENBERG_URL=http://gotenberg.ai-catalyst-staging.local:3000`
(Cloud Map private DNS). Local Docker Compose uses `http://gotenberg:3000`
on the web service (host publish `127.0.0.1:3001`).

Download product default (not signed URL):

```text
Browser → GET /artifacts/:id/download → ArtifactService (authz)
       → StorageProvider.getObject → stream
```

`StorageProvider.createDownloadUrl` exists for optional direct URLs; business code must not depend on it.

## Environments

| Git branch | Environment | Terraform root                                     |
| ---------- | ----------- | -------------------------------------------------- |
| `develop`  | Staging     | [`terraform/envs/staging`](terraform/envs/staging) |

Region default: `ap-southeast-2`. Pushing `main` does not deploy — see
`deploy-aws.yml`.

## Remote state

1. Apply once: [`terraform/backend`](terraform/backend) → S3 state bucket + DynamoDB lock table.
2. Put the real bucket name into `envs/staging`'s `backend "s3"` block (replace the placeholder bucket name).
3. Env state key: `staging/terraform.tfstate`.

## Modules

Sources under [`terraform/modules`](terraform/modules). Summary (no per-module README stubs):

| Module          | Role                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vpc`           | Private + public subnets for ECS (public ALB) and RDS (private). Inputs: `name`, `cidr_block`, `azs`. Outputs: `vpc_id`, `public_subnet_ids`, `private_subnet_ids`.                                                                                                                                                                                                                                                                          |
| `alb`           | Public ALB with target groups for `web` (3000) and `mcp` (8787). `api` stays private. Pass `certificate_arn` when ACM is ready for HTTPS.                                                                                                                                                                                                                                                                                                    |
| `ecr`           | ECR repositories for `web`, `api`, `mcp`.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ecs_cluster`   | Single ECS cluster per environment (Container Insights enabled in staging wiring).                                                                                                                                                                                                                                                                                                                                                           |
| `ecs_service`   | Parameterized Fargate service — instantiate once per container. Inputs include `name`, `cluster_arn`, `subnet_ids`, `security_group_ids`, `cpu`, `memory`, `container_port`, `image`, roles, `desired_count`, `environment`, optional `target_group_arn`. Outputs: `service_name`, `task_definition_arn`. Log groups: `/ecs/<service-name>`.                                                                                                 |
| `rds`           | PostgreSQL 17 in private subnets. Password from Secrets Manager in real apply.                                                                                                                                                                                                                                                                                                                                                               |
| `s3`            | Private artifact bucket (SSE, block public, versioning). Staging bucket names never shared with a future prod stack.                                                                                                                                                                                                                                                                                                                         |
| `iam`           | Least-privilege ECS roles. **ExecutionRole**: ECR pull, CloudWatch logs, Secrets Manager inject. **TaskRole** (per service): S3 R/W, SES send, Secrets read. Outputs: `execution_role_arn`, `task_role_arns`.                                                                                                                                                                                                                                |
| `ses`           | SESv2 email identity. Stay in sandbox until AWS approves production access; verify DKIM after apply.                                                                                                                                                                                                                                                                                                                                         |
| `secrets`       | Secrets Manager placeholders for `database-url`, `better-auth-secret`, optional `oauth`. SES uses task-role credentials, not a static secret.                                                                                                                                                                                                                                                                                                |
| `observability` | Shared SNS topic + P0 CloudWatch alarms. Per-service log groups stay owned by `ecs_service`. Adds: optional email on SNS; ALB unhealthy-host + 5xx (with min request volume); ECS CPU/memory (sustained 5m) + running-count; log metric filters on JSON `event` names (`module_checklist_state_mismatch`, `mcp_tool_failed`) on **web and mcp** log groups. API 5xx is not ALB-backed — use ECS/Sentry/logs until an internal metric exists. |

## Secrets & rotation

| Secret               | Rotation                                                |
| -------------------- | ------------------------------------------------------- |
| RDS / `database-url` | Store in Secrets Manager; RDS-integrated rotation later |
| `BETTER_AUTH_SECRET` | Manual rotate + redeploy web/mcp                        |
| OAuth extras         | Manual                                                  |
| SES                  | Task role credentials; identity is not a secret         |

## App configuration

Providers never read `process.env` themselves. App wiring builds:

- `StorageConfig` via `loadStorageConfigFromEnv` → `resolveProvider(config)`
- `EmailConfig` via `loadEmailConfigFromEnv` → `createEmailSenderFromConfig`

| Variable                        | Staging                    | Local default               |
| ------------------------------- | -------------------------- | --------------------------- |
| `STORAGE_PROVIDER`              | `s3`                       | `local`                     |
| `STORAGE_CONTAINER`             | staging bucket             | n/a (`local-development`)   |
| `EMAIL_PROVIDER`                | `ses` / `noop`             | `noop`                      |
| `EMAIL_FROM`                    | staging identity           | —                           |
| `AUTH_ISSUER_URL`               | `https://staging…`         | `http://localhost:3000`     |
| `MCP_RESOURCE_URL`              | `https://staging…/mcp`     | `http://localhost:8787/mcp` |
| `MCP_OAUTH_TRUST_PROXY_HEADERS` | `true`                     | unset                       |
| `GOTENBERG_URL`                 | Cloud Map Gotenberg URL    | `http://127.0.0.1:3001`     |
| `APP_ENV` / `SERVICE_NAME`      | `staging` / `aicatalyst-*` | `local` / unset             |

## Validate without applying

```powershell
terraform -chdir=infra/aws/terraform/envs/staging init -backend=false
terraform -chdir=infra/aws/terraform/envs/staging validate
node infra/aws/scripts/render-taskdef.mjs --env staging --all
```

`render-taskdef.mjs` uses short container names (`web` / `api` / `mcp`) to match
live task definitions and `deploy-aws.yml`.

## First Staging apply (later)

1. Bootstrap backend; update backend bucket names.
2. Copy `terraform.tfvars.example` → `terraform.tfvars` (gitignored locally).
3. Align modules with live staging (short container names, Secrets Manager
   `secrets`, HTTPS listener) **before** any apply.
4. `terraform apply` in `envs/staging` only after that alignment.
5. Put `DATABASE_URL` / `BETTER_AUTH_SECRET` into Secrets Manager.
6. Set public `AUTH_ISSUER_URL` / `MCP_RESOURCE_URL` / CORS / MCP allowlists.
7. Run migrations + seed against RDS.
8. Verify SES identity (DKIM); request SES production access when ready.
9. Live deploys: push to `develop` (`deploy-aws.yml`).

## SES

Sandbox: can only send to verified addresses until AWS approves production
access (SES quota language — not an AWS environment name). Domain/DKIM
verification is post-apply console work.
