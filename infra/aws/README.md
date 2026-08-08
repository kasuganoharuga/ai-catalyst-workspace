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

| Module        | README                                                                         |
| ------------- | ------------------------------------------------------------------------------ |
| vpc           | [modules/vpc](terraform/modules/vpc/README.md)                                 |
| alb           | [modules/alb](terraform/modules/alb/README.md)                                 |
| ecr           | [modules/ecr](terraform/modules/ecr/README.md)                                 |
| ecs_cluster   | [modules/ecs_cluster](terraform/modules/ecs_cluster/README.md)                 |
| ecs_service   | [modules/ecs_service](terraform/modules/ecs_service/README.md) (parameterized) |
| rds           | [modules/rds](terraform/modules/rds/README.md)                                 |
| s3            | [modules/s3](terraform/modules/s3/README.md)                                   |
| iam           | [modules/iam](terraform/modules/iam/README.md) (separate Task/Execution roles) |
| ses           | [modules/ses](terraform/modules/ses/README.md)                                 |
| secrets       | [modules/secrets](terraform/modules/secrets/README.md)                         |
| observability | [modules/observability](terraform/modules/observability/README.md)             |

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

| Variable                        | Staging                 | Local default               |
| ------------------------------- | ----------------------- | --------------------------- |
| `STORAGE_PROVIDER`              | `s3`                    | `local`                     |
| `STORAGE_CONTAINER`             | staging bucket          | n/a (`local-development`)   |
| `EMAIL_PROVIDER`                | `ses` / `noop`          | `noop`                      |
| `EMAIL_FROM`                    | staging identity        | —                           |
| `AUTH_ISSUER_URL`               | `https://staging…`      | `http://localhost:3000`     |
| `MCP_RESOURCE_URL`              | `https://staging…/mcp`  | `http://localhost:8787/mcp` |
| `MCP_OAUTH_TRUST_PROXY_HEADERS` | `true`                  | unset                       |
| `GOTENBERG_URL`                 | Cloud Map Gotenberg URL | `http://127.0.0.1:3001`     |

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
