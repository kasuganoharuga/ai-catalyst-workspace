variable "name" { type = string }
variable "secret_names" {
  type = list(string)
}

# Placeholder secrets — values set manually / via CI after apply.
# Rotation notes: see infra/aws/README.md (DB password, BETTER_AUTH_SECRET).

resource "aws_secretsmanager_secret" "this" {
  for_each = toset(var.secret_names)
  name     = "${var.name}/${each.key}"
}

output "secret_arns" {
  value = [for s in aws_secretsmanager_secret.this : s.arn]
}

output "secret_arns_by_name" {
  value = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}
