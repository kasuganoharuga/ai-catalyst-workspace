variable "name" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "certificate_arn" {
  type        = string
  description = <<-EOT
    ACM certificate ARN for the HTTPS listener. Empty skips the listener and its
    rules entirely, which leaves an ALB that answers every request with the
    port-80 "use HTTPS" refusal — deployable, but not serving. A production root
    must set this.
  EOT
  default     = ""
}

variable "ssl_policy" {
  type        = string
  description = "ALB predefined TLS policy. The default is TLS 1.2+ with forward secrecy."
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
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

locals {
  https_enabled = var.certificate_arn != ""
}

# Port 80 redirects once HTTPS exists, and refuses before that. The refusal is
# not politeness: without a certificate there is nowhere to redirect to, and
# serving the app over plain HTTP would hand out session cookies in clear text.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = local.https_enabled ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = local.https_enabled ? [] : [1]
    content {
      type = "fixed-response"
      fixed_response {
        content_type = "text/plain"
        message_body = "use HTTPS"
        status_code  = "400"
      }
    }
  }
}

/**
 * The listener that actually carries traffic. Until this exists the target
 * groups are wired to services but nothing routes to them, so the stack looks
 * healthy in ECS while every request 400s on the port-80 listener above.
 *
 * `web` is the default action and `mcp` is reached by path, because both live on
 * one hostname: apps/web is the OAuth Authorization Server at
 * `AUTH_ISSUER_URL` and apps/mcp is the Resource Server at
 * `${AUTH_ISSUER_URL}/mcp` (MCP_RESOURCE_URL). Splitting them across hostnames
 * would mean a second certificate and a second DNS record for no gain.
 */
resource "aws_lb_listener" "https" {
  count = local.https_enabled ? 1 : 0

  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

/**
 * Everything the MCP Resource Server owns, and nothing else.
 *
 * `/mcp*` is the Streamable HTTP endpoint. The protected-resource document is
 * separate and easy to miss: RFC 9728 requires it at a well-known path on the
 * resource's own origin, apps/mcp serves it, and an MCP client fetches it first
 * to discover the Authorization Server. Route it to `web` by accident and every
 * client fails discovery before it ever reaches /mcp.
 *
 * `/.well-known/oauth-authorization-server` deliberately stays on `web` — that
 * one is the Authorization Server's own metadata, and apps/web has a route for
 * it. The two well-known documents look alike and belong to opposite halves.
 */
resource "aws_lb_listener_rule" "mcp" {
  count = local.https_enabled ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mcp.arn
  }

  condition {
    path_pattern {
      values = [
        "/mcp",
        "/mcp/*",
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/*",
      ]
    }
  }
}

output "alb_dns_name" { value = aws_lb.this.dns_name }
output "alb_arn_suffix" { value = aws_lb.this.arn_suffix }
output "alb_security_group_id" { value = aws_security_group.alb.id }
output "web_target_group_arn" { value = aws_lb_target_group.web.arn }
output "web_target_group_arn_suffix" { value = aws_lb_target_group.web.arn_suffix }
output "mcp_target_group_arn" { value = aws_lb_target_group.mcp.arn }
output "mcp_target_group_arn_suffix" { value = aws_lb_target_group.mcp.arn_suffix }
