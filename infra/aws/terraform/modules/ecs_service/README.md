# module: ecs_service

Parameterized Fargate service. Instantiate once per container (`web`, `api`,
`mcp`, later `worker` / `scheduler`) without changing this module.

## Inputs

`name`, `cluster_arn`, `subnet_ids`, `security_group_ids`, `cpu`, `memory`,
`container_port`, `image`, `execution_role_arn`, `task_role_arn`,
`desired_count`, `environment`, `assign_public_ip`, optional `target_group_arn`

## Outputs

`service_name`, `task_definition_arn`
