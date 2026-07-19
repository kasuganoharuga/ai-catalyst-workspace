# AWS infrastructure (PR 2.10 prep)

All-AWS Staging + Production readiness. **This workstream does not `terraform apply`** — it ships IaC, app config, and a manual deploy workflow so a later cutover is one documented apply away.

## Architecture

```text
Developer
   → GitHub (develop = Staging, main = Production)
   → Actions (workflow_dispatch)
   → ECR (web / api / mcp matrix)
   → ECS Fargate
   → ALB (HTTPS)
        → Web (:3000)
        → MCP (:8787)
   → private: API (:8000), RDS Postgres
   → S3 (artifacts), SES (email), Secrets Manager
```

Download product default (not signed URL):

```text
Browser → GET /artifacts/:id/download → ArtifactService (authz)
       → StorageProvider.getObject → stream
```

`StorageProvider.createDownloadUrl` exists for optional direct URLs; business code must not depend on it.

## Environments

| Git branch | Environment | Terraform root |
|------------|-------------|----------------|
| `develop` | Staging | [`terraform/envs/staging`](terraform/envs/staging) |
| `main` | Production | [`terraform/envs/production`](terraform/envs/production) |

Region default: `ap-southeast-2`.

## Remote state (Must Fix — designed now)

1. Apply once: [`terraform/backend`](terraform/backend) → S3 state bucket + DynamoDB lock table.
2. Put the real bucket name into each env's `backend "s3"` block (replace `ai-catalyst-tfstate-REPLACE_ME`).
3. Env state keys: `staging/terraform.tfstate`, `production/terraform.tfstate`.

## Modules

| Module | README |
|--------|--------|
| vpc | [modules/vpc](terraform/modules/vpc/README.md) |
| alb | [modules/alb](terraform/modules/alb/README.md) |
| ecr | [modules/ecr](terraform/modules/ecr/README.md) |
| ecs_cluster | [modules/ecs_cluster](terraform/modules/ecs_cluster/README.md) |
| ecs_service | [modules/ecs_service](terraform/modules/ecs_service/README.md) (parameterized) |
| rds | [modules/rds](terraform/modules/rds/README.md) |
| s3 | [modules/s3](terraform/modules/s3/README.md) |
| iam | [modules/iam](terraform/modules/iam/README.md) (separate Task/Execution roles) |
| ses | [modules/ses](terraform/modules/ses/README.md) |
| secrets | [modules/secrets](terraform/modules/secrets/README.md) |
| observability | [modules/observability](terraform/modules/observability/README.md) |

## Secrets & rotation

| Secret | Rotation |
|--------|----------|
| RDS / `database-url` | Store in Secrets Manager; RDS-integrated rotation later |
| `BETTER_AUTH_SECRET` | Manual rotate + redeploy web/mcp |
| OAuth extras | Manual |
| SES | Task role credentials; identity is not a secret |

## App configuration (composition root)

Providers never read `process.env` themselves. Composition roots build:

- `StorageConfig` via `loadStorageConfigFromEnv` → `resolveProvider(config)`
- `EmailConfig` via `loadEmailConfigFromEnv` → `createEmailSenderFromConfig`

| Variable | Staging | Production | Local default |
|----------|---------|------------|---------------|
| `STORAGE_PROVIDER` | `s3` | `s3` | `local` |
| `STORAGE_CONTAINER` | staging bucket | prod bucket | n/a (`local-development`) |
| `EMAIL_PROVIDER` | `ses` | `ses` | `noop` |
| `EMAIL_FROM` | staging identity | prod identity | — |
| `AUTH_ISSUER_URL` | `https://staging-web…` | `https://web…` | `http://localhost:3000` |
| `MCP_RESOURCE_URL` | `https://staging-mcp…/mcp` | `https://mcp…/mcp` | `http://localhost:8787/mcp` |
| `MCP_OAUTH_TRUST_PROXY_HEADERS` | `true` | `true` | unset |

## Validate without applying

```powershell
terraform -chdir=infra/aws/terraform/envs/staging init -backend=false
terraform -chdir=infra/aws/terraform/envs/staging validate
terraform -chdir=infra/aws/terraform/envs/production init -backend=false
terraform -chdir=infra/aws/terraform/envs/production validate
node infra/aws/scripts/render-taskdef.mjs --env staging --all
```

## First Staging apply (later)

1. Bootstrap backend; update backend bucket names.
2. Copy `terraform.tfvars.example` → `terraform.tfvars` (gitignored locally).
3. `terraform apply` in `envs/staging`.
4. Put `DATABASE_URL` / `BETTER_AUTH_SECRET` into Secrets Manager.
5. Set public `AUTH_ISSUER_URL` / `MCP_RESOURCE_URL` / CORS / MCP allowlists.
6. Run migrations + seed against RDS.
7. Verify SES identity (DKIM); request production access when ready.
8. Use GitHub Actions **Deploy** workflow (`mode=push`) with `AWS_DEPLOY_ROLE_ARN`.

## SES

Sandbox: can only send to verified addresses until AWS approves production access. Domain/DKIM verification is post-apply console work.
