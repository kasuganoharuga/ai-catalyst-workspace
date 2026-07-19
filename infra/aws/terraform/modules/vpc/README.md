# module: vpc

Private + public subnets for ECS (public ALB) and RDS (private).

## Inputs

| Name | Description |
|------|-------------|
| `name` | Name prefix |
| `cidr_block` | VPC CIDR |
| `azs` | Availability zones (2+) |

## Outputs

`vpc_id`, `public_subnet_ids`, `private_subnet_ids`
