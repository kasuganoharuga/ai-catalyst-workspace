variable "name" {
  type = string
}

variable "alarm_email" {
  type        = string
  description = "Optional SNS email subscription for P0 alarms. Empty skips subscription."
  default     = ""
}

variable "alb_arn_suffix" {
  type = string
}

variable "web_target_group_arn_suffix" {
  type = string
}

variable "mcp_target_group_arn_suffix" {
  type = string
}

variable "ecs_cluster_name" {
  type = string
}

variable "web_service_name" {
  type = string
}

variable "api_service_name" {
  type = string
}

variable "mcp_service_name" {
  type = string
}

# -------------------------------------------------------------------------
# SNS — low-priority staging notifications (email optional)
# -------------------------------------------------------------------------

resource "aws_sns_topic" "alarms" {
  name = "${var.name}-alarms"
}

resource "aws_sns_topic_subscription" "alarms_email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# -------------------------------------------------------------------------
# ALB — unhealthy hosts + 5xx with minimum request volume
# -------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "web_unhealthy_hosts" {
  alarm_name          = "${var.name}-web-unhealthy-hosts"
  alarm_description   = "Web target group has unhealthy hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.web_target_group_arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "mcp_unhealthy_hosts" {
  alarm_name          = "${var.name}-mcp-unhealthy-hosts"
  alarm_description   = "MCP target group has unhealthy hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.mcp_target_group_arn_suffix
  }
}

# 5xx count over 5 minutes, but only when RequestCount exceeds a floor so
# idle/low-traffic periods do not page on a handful of errors.
resource "aws_cloudwatch_metric_alarm" "web_target_5xx" {
  alarm_name          = "${var.name}-web-target-5xx"
  alarm_description   = "Web ALB target 5xx with minimum request volume"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  metric_query {
    id          = "errors"
    return_data = false

    metric {
      metric_name = "HTTPCode_Target_5XX_Count"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"

      dimensions = {
        LoadBalancer = var.alb_arn_suffix
        TargetGroup  = var.web_target_group_arn_suffix
      }
    }
  }

  metric_query {
    id          = "requests"
    return_data = false

    metric {
      metric_name = "RequestCount"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"

      dimensions = {
        LoadBalancer = var.alb_arn_suffix
        TargetGroup  = var.web_target_group_arn_suffix
      }
    }
  }

  metric_query {
    id          = "errors_when_volume"
    expression  = "IF(requests >= 20, errors, 0)"
    label       = "Web5xxWhenVolume"
    return_data = true
  }
}

resource "aws_cloudwatch_metric_alarm" "mcp_target_5xx" {
  alarm_name          = "${var.name}-mcp-target-5xx"
  alarm_description   = "MCP ALB target 5xx with minimum request volume"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  metric_query {
    id          = "errors"
    return_data = false

    metric {
      metric_name = "HTTPCode_Target_5XX_Count"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"

      dimensions = {
        LoadBalancer = var.alb_arn_suffix
        TargetGroup  = var.mcp_target_group_arn_suffix
      }
    }
  }

  metric_query {
    id          = "requests"
    return_data = false

    metric {
      metric_name = "RequestCount"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"

      dimensions = {
        LoadBalancer = var.alb_arn_suffix
        TargetGroup  = var.mcp_target_group_arn_suffix
      }
    }
  }

  metric_query {
    id          = "errors_when_volume"
    expression  = "IF(requests >= 20, errors, 0)"
    label       = "Mcp5xxWhenVolume"
    return_data = true
  }
}

# -------------------------------------------------------------------------
# ECS — sustained CPU/memory (5 minutes) + running count
# -------------------------------------------------------------------------

locals {
  ecs_services = {
    web = var.web_service_name
    api = var.api_service_name
    mcp = var.mcp_service_name
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  for_each = local.ecs_services

  alarm_name          = "${var.name}-${each.key}-cpu-high"
  alarm_description   = "ECS ${each.key} CPU sustained high for 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  for_each = local.ecs_services

  alarm_name          = "${var.name}-${each.key}-memory-high"
  alarm_description   = "ECS ${each.key} memory sustained high for 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_running_count_low" {
  for_each = local.ecs_services

  alarm_name          = "${var.name}-${each.key}-running-count-low"
  alarm_description   = "ECS ${each.key} running task count below 1"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = each.value
  }
}

# -------------------------------------------------------------------------
# Log metric filters on stable `event` field (JSON logs)
# -------------------------------------------------------------------------

resource "aws_cloudwatch_log_metric_filter" "module_checklist_state_mismatch" {
  name           = "${var.name}-module-checklist-state-mismatch"
  log_group_name = "/ecs/${var.web_service_name}"
  pattern        = "{ $.event = \"module_checklist_state_mismatch\" }"

  metric_transformation {
    name          = "ModuleChecklistStateMismatch"
    namespace     = "AICatalyst/${var.name}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "mcp_tool_failed" {
  name           = "${var.name}-mcp-tool-failed"
  log_group_name = "/ecs/${var.mcp_service_name}"
  pattern        = "{ $.event = \"mcp_tool_failed\" }"

  metric_transformation {
    name          = "McpToolFailed"
    namespace     = "AICatalyst/${var.name}"
    value         = "1"
    default_value = "0"
  }
}

output "log_prefix" {
  value = "/ecs/${var.name}"
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}
