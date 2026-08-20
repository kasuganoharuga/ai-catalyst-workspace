variable "name" { type = string }
variable "cidr_block" {
  type    = string
  default = "10.20.0.0/16"
}
variable "azs" {
  type = list(string)
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = var.name }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-igw" }
}

resource "aws_subnet" "public" {
  count                   = length(var.azs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.cidr_block, 4, count.index)
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true
  tags                    = { Name = "${var.name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.cidr_block, 4, count.index + 8)
  availability_zone = var.azs[count.index]
  tags              = { Name = "${var.name}-private-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${var.name}-public" }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

/**
 * Egress for the private subnets.
 *
 * Without this the private subnets have no route off the VPC at all, and a
 * Fargate task placed in one cannot start: pulling its image from ECR, reading
 * Secrets Manager, writing CloudWatch logs and reaching SES are all calls to
 * public endpoints. The failure is `CannotPullContainerError`, which reads like
 * a registry problem rather than a routing one.
 *
 * One NAT gateway, not one per availability zone. It is a single point of
 * failure for outbound traffic — if its AZ goes, tasks in the other AZ lose
 * egress — and that is the deliberate trade: per-AZ NAT roughly triples the
 * standing cost for an environment serving a small cohort. Revisit alongside
 * raising desired_count above one, since both are the same decision about how
 * much an AZ outage may cost.
 *
 * The alternative shape is VPC endpoints for ECR/S3/Secrets Manager/Logs, which
 * is cheaper at this traffic level but does not cover genuinely external calls
 * — Sentry ingest being the one in use — so it would have to be NAT *as well*
 * rather than instead.
 */
variable "enable_nat_gateway" {
  type        = bool
  default     = true
  description = "Disable only for a VPC whose private subnets are intentionally unreachable."
}

resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? 1 : 0
  domain = "vpc"
  tags   = { Name = "${var.name}-nat" }
}

resource "aws_nat_gateway" "this" {
  count         = var.enable_nat_gateway ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  # Must sit in a public subnet: the NAT reaches the internet through the same
  # internet gateway the public route table uses.
  subnet_id  = aws_subnet.public[0].id
  tags       = { Name = "${var.name}-nat" }
  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-private" }
}

resource "aws_route" "private_nat" {
  count                  = var.enable_nat_gateway ? 1 : 0
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[0].id
}

# Associated even with NAT disabled, so the private subnets stop silently
# inheriting the VPC's main route table — where a later change to that table
# would reach them unnoticed.
resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

output "vpc_id" { value = aws_vpc.this.id }
output "public_subnet_ids" { value = aws_subnet.public[*].id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
