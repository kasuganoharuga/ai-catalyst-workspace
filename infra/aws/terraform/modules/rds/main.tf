variable "name" { type = string }
variable "subnet_ids" { type = list(string) }
variable "vpc_security_group_ids" { type = list(string) }
variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "allocated_storage" {
  type    = number
  default = 20
}

variable "db_name" {
  type    = string
  default = "ai_catalyst"
}
variable "username" {
  type    = string
  default = "ai_catalyst"
}
variable "password" {
  type      = string
  sensitive = true
}

# The three below default to the careful setting, so a new environment root that
# forgets them gets a database that cannot be destroyed by a stray `terraform
# destroy` or a resource rename. Staging opts out explicitly — an environment
# that is periodically reset on purpose (see reset-staging-db.yml) should not
# need a two-step dance to do it — which also makes the opt-out visible in the
# diff of whichever root does it, rather than being the silent default.
variable "deletion_protection" {
  type    = bool
  default = true
}

variable "skip_final_snapshot" {
  type    = bool
  default = false
}

variable "backup_retention_period" {
  type    = number
  default = 7
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.subnet_ids
}

resource "aws_db_instance" "this" {
  identifier                 = "${var.name}-postgres"
  engine                     = "postgres"
  engine_version             = "17"
  instance_class             = var.instance_class
  allocated_storage          = var.allocated_storage
  db_name                    = var.db_name
  username                   = var.username
  password                   = var.password
  db_subnet_group_name       = aws_db_subnet_group.this.name
  vpc_security_group_ids     = var.vpc_security_group_ids
  publicly_accessible        = false
  storage_encrypted          = true
  skip_final_snapshot        = var.skip_final_snapshot
  deletion_protection        = var.deletion_protection
  backup_retention_period    = var.backup_retention_period
  auto_minor_version_upgrade = true

  # Required by AWS whenever skip_final_snapshot is false, and null when it is
  # true (passing both is an error). A fixed name rather than a timestamped one:
  # a second destroy then fails loudly on a duplicate snapshot id instead of
  # quietly scattering snapshots nobody can tell apart.
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name}-final"
}

output "identifier" { value = aws_db_instance.this.identifier }
output "endpoint" { value = aws_db_instance.this.address }
output "port" { value = aws_db_instance.this.port }
