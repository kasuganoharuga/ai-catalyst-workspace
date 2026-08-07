# module: iam

Least-privilege ECS roles. Kept separate from `ecs_service` so TaskRole /
ExecutionRole / policies stay reviewable.

## Roles

| Role                   | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| ExecutionRole          | ECR pull, CloudWatch logs, Secrets Manager inject |
| TaskRole (per service) | App runtime: S3 R/W, SES send, Secrets read       |

## Inputs

`name`, `artifact_bucket_arn`, `secret_arns`, `service_names`

## Outputs

`execution_role_arn`, `task_role_arns` (map by service name)
