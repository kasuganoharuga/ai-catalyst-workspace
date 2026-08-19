terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — fill bucket/table after applying terraform/backend once.
  backend "s3" {
    bucket         = "ai-catalyst-tfstate-REPLACE_ME"
    key            = "staging/terraform.tfstate"
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
  default = "ai-catalyst-staging"
}

variable "artifact_bucket_name" {
  type = string
}

variable "ses_email_identity" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "sentry_dsn" {
  type        = string
  default     = ""
  description = <<-EOT
    Server-side Sentry DSN for web / api / mcp. Empty leaves Sentry
    uninitialised — every entry point checks for a DSN before calling
    Sentry.init (apps/web/sentry.server.config.ts, apps/mcp/src/sentry.ts), so
    an unset value disables error reporting silently rather than failing.

    Not a Secrets Manager entry: a DSN is an ingest endpoint, not a
    credential, and the browser half of it ships inside the client bundle
    regardless.

    This covers server-side only. Browser errors need NEXT_PUBLIC_SENTRY_DSN,
    which Next.js inlines at `next build` — a task-definition variable cannot
    reach the client bundle, so that one is a Docker build arg in
    .github/workflows/deploy-aws.yml instead.
  EOT
}

variable "log_level" {
  type        = string
  default     = "info"
  description = "packages/observability minimum level: debug | info | warn | error."
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
  cidr_block = "10.30.0.0/16"
}

# Observability is declared after ALB / ECS modules so it can reference
# their outputs — see the module "observability" block near the bottom.

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
  # Placeholders only — values are set manually after apply (see
  # infra/aws/README.md "Secrets & rotation"). The google-* pair is needed
  # only once AUTH_GOOGLE_ENABLED is flipped in
  # apps/web/lib/feature-flags.ts; creating the placeholders ahead of that is
  # free and means the flip is not blocked on a Terraform round trip.
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
  source     = "../../modules/alb"
  name       = var.name
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.public_subnet_ids
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

  # Web → Gotenberg (Cloud Map DNS). Same ECS SG; ALB ingress above does
  # not cover task-to-task traffic on :3000.
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

  # Staging is deliberately disposable — reset-staging-db.yml exists to wipe it
  # — so it opts out of the module's careful defaults. A production root must
  # not copy these three lines; leaving them off is what makes that stack
  # undestroyable-by-accident and snapshot-on-destroy.
  deletion_protection = false
  skip_final_snapshot = true
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
  # Only set when supplied. An empty SENTRY_DSN would be indistinguishable from
  # a real one to a reader of the task definition while reporting nothing.
  sentry_env = var.sentry_dsn == "" ? {} : { SENTRY_DSN = var.sentry_dsn }

  common_env = merge({
    AWS_REGION = var.aws_region
    # Load-bearing, not cosmetic: `isModuleResetAllowed`
    # (packages/services/src/module/reset-allowed.ts) allow-lists this value,
    # and a task definition that loses it hides the Module reset tool. The
    # production stack must set APP_ENV=production for the same reason in
    # reverse — there the tool is irreversible data loss.
    APP_ENV                       = "staging"
    LOG_LEVEL                     = var.log_level
    STORAGE_PROVIDER              = "s3"
    STORAGE_CONTAINER             = module.s3.bucket_name
    EMAIL_PROVIDER                = "ses"
    EMAIL_FROM                    = var.ses_email_identity
    MCP_OAUTH_TRUST_PROXY_HEADERS = "true"
  }, local.sentry_env)
}

module "web" {
  source             = "../../modules/ecs_service"
  name               = "${var.name}-web"
  cluster_arn        = module.ecs_cluster.cluster_arn
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [aws_security_group.ecs.id]
  container_port     = 3000
  image              = var.web_image
  execution_role_arn = module.iam.execution_role_arn
  task_role_arn      = module.iam.task_role_arns["web"]
  target_group_arn   = module.alb.web_target_group_arn
  aws_region         = var.aws_region
  environment = merge(local.common_env, {
    # Private Cloud Map name (see module.gotenberg). Live staging uses
    # short container name "web" + this env; deploy-aws.yml preserves it
    # when rewriting the image digest.
    GOTENBERG_URL       = "http://gotenberg.${var.name}.local:3000"
    SERVICE_NAME        = "aicatalyst-web"
    NEXT_PUBLIC_APP_ENV = "staging"
  })
}

# HTML→PDF for printable artefacts. Not on the ALB — web reaches it via
# Cloud Map (`gotenberg.<name>.local`). Live staging already has the
# private DNS namespace + service registry; this module records the ECS
# shape (image/cpu/memory). Wire service_registries in a follow-up once
# the ecs_service module supports Cloud Map.
module "gotenberg" {
  source             = "../../modules/ecs_service"
  name               = "${var.name}-gotenberg"
  cluster_arn        = module.ecs_cluster.cluster_arn
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [aws_security_group.ecs.id]
  container_port     = 3000
  cpu                = 1024
  memory             = 2048
  image              = "gotenberg/gotenberg:8"
  execution_role_arn = module.iam.execution_role_arn
  task_role_arn      = module.iam.task_role_arns["api"]
  aws_region         = var.aws_region
  environment        = {}
}

module "api" {
  source             = "../../modules/ecs_service"
  name               = "${var.name}-api"
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
  cluster_arn        = module.ecs_cluster.cluster_arn
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [aws_security_group.ecs.id]
  container_port     = 8787
  image              = var.mcp_image
  execution_role_arn = module.iam.execution_role_arn
  task_role_arn      = module.iam.task_role_arns["mcp"]
  target_group_arn   = module.alb.mcp_target_group_arn
  aws_region         = var.aws_region
  environment = merge(local.common_env, {
    SERVICE_NAME = "aicatalyst-mcp"
  })
}

module "observability" {
  source                      = "../../modules/observability"
  name                        = var.name
  alb_arn_suffix              = module.alb.alb_arn_suffix
  web_target_group_arn_suffix = module.alb.web_target_group_arn_suffix
  mcp_target_group_arn_suffix = module.alb.mcp_target_group_arn_suffix
  ecs_cluster_name            = module.ecs_cluster.cluster_name
  web_service_name            = module.web.service_name
  api_service_name            = module.api.service_name
  mcp_service_name            = module.mcp.service_name
}

output "alb_dns_name" { value = module.alb.alb_dns_name }
output "ecr_urls" { value = module.ecr.repository_urls }
output "artifact_bucket" { value = module.s3.bucket_name }
output "rds_endpoint" { value = module.rds.endpoint }
output "secret_arns" { value = module.secrets.secret_arns_by_name }
output "log_prefix" { value = module.observability.log_prefix }
output "alarm_topic_arn" { value = module.observability.alarm_topic_arn }
