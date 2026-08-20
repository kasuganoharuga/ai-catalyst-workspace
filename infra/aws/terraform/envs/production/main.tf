/**
 * Production.
 *
 * Composed from the same modules as envs/staging, and deliberately kept in the
 * same order so the two roots diff cleanly against each other — reviewing "what
 * is different about production" should be a `diff`, not an archaeology
 * exercise. Every intentional difference carries a comment saying why.
 *
 * The differences, in one place:
 *   - APP_ENV=production, which disables the Module reset tool. That tool
 *     permanently deletes a Founder's work; see reset-allowed.ts.
 *   - RDS keeps the module's careful defaults (deletion protection on, final
 *     snapshot taken, 14-day backups) instead of staging's opt-out.
 *   - certificate_arn is required, not optional. Without it the ALB serves
 *     nothing but the "use HTTPS" refusal.
 *   - Its own VPC CIDR, S3 bucket, ECR repositories and Secrets Manager
 *     entries. Nothing is shared with staging, so a mistake in one cannot
 *     reach the other.
 *   - Database alarms and an alarm email are wired by default.
 */

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Same bucket as staging, different key. Fill the bucket name in after
  # applying terraform/backend once — see infra/aws/README.md "Remote state".
  backend "s3" {
    bucket         = "ai-catalyst-tfstate-765332581489"
    key            = "production/terraform.tfstate"
    region         = "ap-southeast-2"
    dynamodb_table = "ai-catalyst-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "ap-southeast-2"
}

variable "name" {
  type    = string
  default = "ai-catalyst-production"
}

variable "artifact_bucket_name" {
  type        = string
  description = "Never a name staging also uses — the two environments must not share objects."
}

variable "ses_email_identity" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "public_base_url" {
  type        = string
  description = <<-EOT
    The origin users reach, with scheme and no trailing slash.

    Becomes AUTH_ISSUER_URL (Better Auth's OAuth issuer and cookie/redirect
    base) and the root of MCP_RESOURCE_URL. It must match the certificate and
    the DNS record exactly — scheme, apex vs www, no trailing slash — or OAuth
    redirects fail with redirect_uri_mismatch.
  EOT
}

variable "certificate_arn" {
  type        = string
  description = <<-EOT
    ACM certificate for the HTTPS listener. Required here, unlike staging: with
    it empty the ALB answers every request with the port-80 "use HTTPS" refusal,
    so an empty value is a production outage rather than a degraded environment.
  EOT
}

variable "alarm_email" {
  type        = string
  description = <<-EOT
    Address subscribed to the SNS alarm topic. Required here — an unmonitored
    production environment is the failure mode this whole module exists to
    prevent. AWS sends a confirmation mail that must be accepted before
    anything is delivered.
  EOT
}

variable "sentry_dsn" {
  type        = string
  default     = ""
  description = <<-EOT
    Server-side Sentry DSN. Empty leaves Sentry uninitialised and errors
    visible only in CloudWatch. Browser errors need NEXT_PUBLIC_SENTRY_DSN,
    which Next.js inlines at `next build` — a task-definition variable cannot
    reach the client bundle, so that one is a Docker build arg in
    .github/workflows/deploy-aws.yml.
  EOT
}

variable "log_level" {
  type    = string
  default = "info"
}

variable "db_instance_class" {
  type        = string
  default     = "db.t4g.small"
  description = "One size up from staging's micro — production carries real load and real data."
}

variable "db_allocated_storage" {
  type    = number
  default = 50
}

variable "web_image" {
  type    = string
  default = "public.ecr.aws/docker/library/nginx:alpine"
}

variable "api_image" {
  type    = string
  default = "public.ecr.aws/docker/library/nginx:alpine"
}

variable "mcp_image" {
  type    = string
  default = "public.ecr.aws/docker/library/nginx:alpine"
}

data "aws_availability_zones" "available" {
  state = "available"
}

module "vpc" {
  source     = "../../modules/vpc"
  name       = var.name
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)
  cidr_block = local.vpc_cidr_block
}

module "ecr" {
  source           = "../../modules/ecr"
  name             = var.name
  repository_names = ["web", "api", "mcp"]
}

module "s3" {
  source      = "../../modules/s3"
  bucket_name = var.artifact_bucket_name
}

module "secrets" {
  source = "../../modules/secrets"
  name   = var.name
  # Placeholders. Values are written by hand after apply — see
  # infra/aws/README.md "Secrets & rotation". The google-* pair costs nothing
  # to create early and means flipping AUTH_GOOGLE_ENABLED is not blocked on a
  # Terraform round trip.
  secret_names = [
    "database-url",
    "better-auth-secret",
    "google-client-id",
    "google-client-secret",
  ]
}

module "ses" {
  source         = "../../modules/ses"
  email_identity = var.ses_email_identity
}

module "alb" {
  source          = "../../modules/alb"
  name            = var.name
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.public_subnet_ids
  certificate_arn = var.certificate_arn
}

resource "aws_security_group" "ecs" {
  name   = "${var.name}-ecs"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [module.alb.alb_security_group_id]
  }

  # Web → Gotenberg over Cloud Map. The ALB ingress above does not cover
  # task-to-task traffic on the same port.
  ingress {
    from_port = 3000
    to_port   = 3000
    protocol  = "tcp"
    self      = true
  }

  ingress {
    from_port       = 8787
    to_port         = 8787
    protocol        = "tcp"
    security_groups = [module.alb.alb_security_group_id]
  }

  ingress {
    from_port = 8000
    to_port   = 8000
    protocol  = "tcp"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "rds" {
  name   = "${var.name}-rds"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

module "rds" {
  source                 = "../../modules/rds"
  name                   = var.name
  subnet_ids             = module.vpc.private_subnet_ids
  vpc_security_group_ids = [aws_security_group.rds.id]
  password               = var.db_password
  instance_class         = var.db_instance_class
  allocated_storage      = var.db_allocated_storage

  # No opt-out here, unlike staging. The module defaults are deletion protection
  # on and a final snapshot on destroy, which is exactly what production wants;
  # the only override is a longer backup window.
  backup_retention_period = 14
}

module "iam" {
  source              = "../../modules/iam"
  name                = var.name
  artifact_bucket_arn = module.s3.bucket_arn
  secret_arns         = module.secrets.secret_arns
  service_names       = ["web", "api", "mcp"]
}

module "ecs_cluster" {
  source = "../../modules/ecs_cluster"
  name   = var.name
}

locals {
  # Distinct from staging's 10.30.0.0/16 so the two can be peered later without
  # renumbering. Also reused as AUTH_TRUSTED_PROXIES below — the network whose
  # X-Forwarded-For hops may be believed is the network the ALB forwards from.
  vpc_cidr_block = "10.40.0.0/16"

  # Host header allowlist for apps/mcp. Unset, the process defaults to
  # localhost / 127.0.0.1 / mcp — every public request then 403s
  # `Invalid Host` and Claude reports "Couldn't connect to the server".
  public_host = trimsuffix(
    trimprefix(trimprefix(var.public_base_url, "https://"), "http://"),
    "/",
  )

  sentry_env = var.sentry_dsn == "" ? {} : { SENTRY_DSN = var.sentry_dsn }

  web_secrets = {
    DATABASE_URL       = module.secrets.secret_arns_by_name["database-url"]
    BETTER_AUTH_SECRET = module.secrets.secret_arns_by_name["better-auth-secret"]
  }

  mcp_secrets = {
    DATABASE_URL = module.secrets.secret_arns_by_name["database-url"]
  }

  common_env = merge({
    AWS_REGION = var.aws_region
    # The single most consequential value in this file. `isModuleResetAllowed`
    # (packages/services/src/module/reset-allowed.ts) allow-lists local /
    # development / test / staging, so "production" is what withholds a button
    # that permanently deletes a Founder's attempts, answers, artefacts and prep
    # material along with every Module after it. Anything unrecognised also
    # withholds it, which is the safe direction — but say it explicitly.
    APP_ENV           = "production"
    LOG_LEVEL         = var.log_level
    STORAGE_PROVIDER  = "s3"
    STORAGE_CONTAINER = module.s3.bucket_name
    EMAIL_PROVIDER    = "ses"
    EMAIL_FROM        = var.ses_email_identity
    AUTH_ISSUER_URL   = var.public_base_url
    MCP_RESOURCE_URL  = "${var.public_base_url}/mcp"
    # See resolveClientIp in apps/web/lib/mcp-oauth-compat/dcr-validation.ts —
    # ALB appends to X-Forwarded-For rather than replacing it, so both readers
    # take the rightmost hop, and this names the network those hops come from.
    MCP_OAUTH_TRUST_PROXY_HEADERS = "true"
    AUTH_TRUSTED_PROXIES          = local.vpc_cidr_block
  }, local.sentry_env)
}

module "web" {
  source             = "../../modules/ecs_service"
  name               = "${var.name}-web"
  container_name     = "web"
  cluster_arn        = module.ecs_cluster.cluster_arn
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [aws_security_group.ecs.id]
  container_port     = 3000
  image              = var.web_image
  execution_role_arn = module.iam.execution_role_arn
  task_role_arn      = module.iam.task_role_arns["web"]
  target_group_arn   = module.alb.web_target_group_arn
  aws_region         = var.aws_region
  secrets            = local.web_secrets
  environment = merge(local.common_env, {
    GOTENBERG_URL = "http://gotenberg.${var.name}.local:3000"
    SERVICE_NAME  = "aicatalyst-web"
    # Server-side reads only. The browser bundle's copy is inlined at
    # `next build` from a Docker build arg — a task-definition value cannot
    # reach it. See the ARG block in apps/web/Dockerfile.
    NEXT_PUBLIC_APP_ENV = "production"
  })
}

# HTML→PDF for printable artefacts. Not on the ALB — web reaches it via
# Cloud Map (`gotenberg.<name>.local`).
resource "aws_service_discovery_private_dns_namespace" "internal" {
  name        = "${var.name}.local"
  description = "Private DNS for ${var.name} task-to-task calls"
  vpc         = module.vpc.vpc_id
}

resource "aws_service_discovery_service" "gotenberg" {
  name = "gotenberg"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.internal.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

module "gotenberg" {
  source               = "../../modules/ecs_service"
  name                 = "${var.name}-gotenberg"
  container_name       = "gotenberg"
  cluster_arn          = module.ecs_cluster.cluster_arn
  subnet_ids           = module.vpc.private_subnet_ids
  security_group_ids   = [aws_security_group.ecs.id]
  container_port       = 3000
  cpu                  = 1024
  memory               = 2048
  image                = "gotenberg/gotenberg:8"
  execution_role_arn   = module.iam.execution_role_arn
  task_role_arn        = module.iam.task_role_arns["api"]
  aws_region           = var.aws_region
  service_registry_arn = aws_service_discovery_service.gotenberg.arn
  environment          = {}
}

module "api" {
  source             = "../../modules/ecs_service"
  name               = "${var.name}-api"
  container_name     = "api"
  cluster_arn        = module.ecs_cluster.cluster_arn
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [aws_security_group.ecs.id]
  container_port     = 8000
  image              = var.api_image
  execution_role_arn = module.iam.execution_role_arn
  task_role_arn      = module.iam.task_role_arns["api"]
  aws_region         = var.aws_region
  environment = merge(local.common_env, {
    SERVICE_NAME = "aicatalyst-api"
  })
}

module "mcp" {
  source             = "../../modules/ecs_service"
  name               = "${var.name}-mcp"
  container_name     = "mcp"
  cluster_arn        = module.ecs_cluster.cluster_arn
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [aws_security_group.ecs.id]
  container_port     = 8787
  image              = var.mcp_image
  execution_role_arn = module.iam.execution_role_arn
  task_role_arn      = module.iam.task_role_arns["mcp"]
  target_group_arn   = module.alb.mcp_target_group_arn
  aws_region         = var.aws_region
  secrets            = local.mcp_secrets
  environment = merge(local.common_env, {
    SERVICE_NAME = "aicatalyst-mcp"
    # hostHeaderValidation runs on POST /mcp. Health and RFC 9728 metadata
    # skip it; Claude's connector probe does not.
    MCP_ALLOWED_HOSTS = join(",", [
      local.public_host,
      module.alb.alb_dns_name,
    ])
    # Requests with no Origin (native desktop, curl) are always allowed.
    # Browser / Electron connectors send one. Exact-match list — keep in
    # sync with PROVIDER_HOST_SUFFIXES in
    # packages/services/src/mcp-auth/provider.ts.
    MCP_ALLOWED_ORIGINS = join(",", [
      var.public_base_url,
      "https://claude.ai",
      "https://www.claude.ai",
      "https://claude.com",
      "https://chatgpt.com",
      "https://www.chatgpt.com",
      "https://chat.openai.com",
      "https://openai.com",
    ])
  })
}

module "observability" {
  source                      = "../../modules/observability"
  name                        = var.name
  alarm_email                 = var.alarm_email
  db_instance_identifier      = module.rds.identifier
  alb_arn_suffix              = module.alb.alb_arn_suffix
  web_target_group_arn_suffix = module.alb.web_target_group_arn_suffix
  mcp_target_group_arn_suffix = module.alb.mcp_target_group_arn_suffix
  ecs_cluster_name            = module.ecs_cluster.cluster_name
  web_service_name            = module.web.service_name
  api_service_name            = module.api.service_name
  mcp_service_name            = module.mcp.service_name
  # 50 GiB volume here rather than staging's 20, so 10% is a different number.
  db_free_storage_bytes_threshold = 5368709120
}

# Values deploy-aws.yml needs as GitHub Actions variables. Print them with
# `terraform output` after apply and set them once; the workflow reads them
# rather than hardcoding infrastructure ids in version control.
output "ecs_cluster_name" { value = module.ecs_cluster.cluster_name }
output "private_subnet_ids" { value = module.vpc.private_subnet_ids }
output "ecs_security_group_id" { value = aws_security_group.ecs.id }

output "alb_dns_name" { value = module.alb.alb_dns_name }
output "ecr_urls" { value = module.ecr.repository_urls }
output "artifact_bucket" { value = module.s3.bucket_name }
output "rds_endpoint" { value = module.rds.endpoint }
output "secret_arns" { value = module.secrets.secret_arns_by_name }
output "alarm_topic_arn" { value = module.observability.alarm_topic_arn }
