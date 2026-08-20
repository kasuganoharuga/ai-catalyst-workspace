variable "name" { type = string }

variable "container_name" {
  type        = string
  default     = null
  description = <<-EOT
    Name of the container inside the task definition. deploy-aws.yml rewrites
    the image by this name (web / api / mcp), so production must pass the short
    name rather than the fully-qualified service name. Defaults to `name`.
  EOT
}

variable "cluster_arn" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_ids" { type = list(string) }
variable "cpu" {
  type    = number
  default = 256
}
variable "memory" {
  type    = number
  default = 512
}
variable "container_port" { type = number }
variable "image" { type = string }
variable "execution_role_arn" { type = string }
variable "task_role_arn" { type = string }
variable "desired_count" {
  type    = number
  default = 1
}
variable "environment" {
  type    = map(string)
  default = {}
}

variable "secrets" {
  type        = map(string)
  default     = {}
  description = <<-EOT
    Environment variables whose values ECS injects from Secrets Manager at
    container start, as { ENV_VAR_NAME = secret_arn }.

    Separate from `environment` because these must never appear in a task
    definition: `aws ecs describe-task-definition` is readable by anyone with
    ECS read access, and deploy-aws.yml prints task definitions on failure.
    ECS resolves them using the execution role, which the iam module already
    grants secretsmanager:GetSecretValue on these ARNs.

    Without this, DATABASE_URL and BETTER_AUTH_SECRET have nowhere to come from
    and the container exits at module load: packages/db/src/pool.ts and
    apps/web/lib/auth.ts both assert them immediately.
  EOT
}
variable "assign_public_ip" {
  type    = bool
  default = false
}
variable "target_group_arn" {
  type    = string
  default = null
}

variable "service_registry_arn" {
  type        = string
  default     = null
  description = "Optional Cloud Map service ARN. Gotenberg uses this so web can reach it as gotenberg.<env>.local."
}

variable "health_check_grace_period_seconds" {
  type        = number
  default     = 60
  description = "Ignored for services with no load balancer, where ECS rejects the setting."
}
variable "aws_region" {
  type    = string
  default = "ap-southeast-2"
}

locals {
  container_name = coalesce(var.container_name, var.name)
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name}"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name      = local.container_name
      image     = var.image
      essential = true
      portMappings = [{
        containerPort = var.container_port
        hostPort      = var.container_port
        protocol      = "tcp"
      }]
      environment = [
        for k, v in var.environment : { name = k, value = v }
      ]
      secrets = [
        for k, v in var.secrets : { name = k, valueFrom = v }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = local.container_name
        }
      }
    }
  ])
}

resource "aws_ecs_service" "this" {
  name            = var.name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # Without this, a deploy whose tasks never pass their health check leaves ECS
  # retrying forever: `aws ecs wait services-stable` in deploy-aws.yml times out
  # and the environment sits on a half-replaced service. With rollback, ECS puts
  # the previous task definition back on its own, so a bad image is an alarm and
  # a red build rather than an outage — which matters more now that a merge to
  # main deploys straight to production.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Give a task time to boot before its first health check counts against it.
  # Only meaningful with a load balancer attached; ECS rejects it otherwise.
  health_check_grace_period_seconds = var.target_group_arn == null ? null : var.health_check_grace_period_seconds

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = var.security_group_ids
    assign_public_ip = var.assign_public_ip
  }

  dynamic "load_balancer" {
    for_each = var.target_group_arn == null ? [] : [var.target_group_arn]
    content {
      target_group_arn = load_balancer.value
      container_name   = local.container_name
      container_port   = var.container_port
    }
  }

  dynamic "service_registries" {
    for_each = var.service_registry_arn == null ? [] : [var.service_registry_arn]
    content {
      registry_arn = service_registries.value
    }
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}

output "service_name" { value = aws_ecs_service.this.name }
output "task_definition_arn" { value = aws_ecs_task_definition.this.arn }
output "task_definition_family" { value = aws_ecs_task_definition.this.family }
