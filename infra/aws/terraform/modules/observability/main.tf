variable "name" { type = string }

# Placeholder module — per-service log groups are owned by ecs_service.
# Kept so operators have a documented home for shared log config later.

output "log_prefix" {
  value = "/ecs/${var.name}"
}
