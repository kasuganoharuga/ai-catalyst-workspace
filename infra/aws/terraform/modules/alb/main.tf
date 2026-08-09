variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS listeners. Empty skips HTTPS listener creation."
  default     = ""
}

resource "aws_security_group" "alb" {
  name   = "${var.name}-alb"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "this" {
  name               = var.name
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.subnet_ids
}

resource "aws_lb_target_group" "web" {
  name        = "${var.name}-web"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  health_check {
    path = "/api/health"
  }
}

resource "aws_lb_target_group" "mcp" {
  name        = "${var.name}-mcp"
  port        = 8787
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  health_check {
    path = "/health"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "use HTTPS"
      status_code  = "400"
    }
  }
}

# Host-based rules can be added after DNS cutover; target groups are ready now.

output "alb_dns_name" { value = aws_lb.this.dns_name }
output "alb_arn_suffix" { value = aws_lb.this.arn_suffix }
output "alb_security_group_id" { value = aws_security_group.alb.id }
output "web_target_group_arn" { value = aws_lb_target_group.web.arn }
output "web_target_group_arn_suffix" { value = aws_lb_target_group.web.arn_suffix }
output "mcp_target_group_arn" { value = aws_lb_target_group.mcp.arn }
output "mcp_target_group_arn_suffix" { value = aws_lb_target_group.mcp.arn_suffix }
