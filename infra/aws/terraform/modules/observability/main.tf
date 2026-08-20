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

variable "db_instance_identifier" {
  type        = string
  default     = ""
  description = <<-EOT
    RDS instance to alarm on. Empty skips the database alarms.

    Worth setting on any environment holding data you would miss: the ALB and
    ECS alarms below describe the app, and the app can look perfectly healthy
    while the database it depends on runs out of disk. Storage is the one that
    actually pages — a full volume stops writes with no warning and no way to
    recover quickly.
  EOT
}

variable "db_free_storage_bytes_threshold" {
  type        = number
  default     = 2147483648
  description = "Alarm below this much free space. 2 GiB, i.e. 10% of the default 20 GiB volume."
}

variable "db_connection_threshold" {
  type        = number
  default     = 80
  description = "Alarm above this many connections. db.t4g.micro's Postgres max_connections is ~112."
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

locals {
  alb_targets = {
    web = {
      target_group_arn_suffix = var.web_target_group_arn_suffix
      label                   = "Web5xxWhenVolume"
    }
    mcp = {
      target_group_arn_suffix = var.mcp_target_group_arn_suffix
      label                   = "Mcp5xxWhenVolume"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  for_each = local.alb_targets

  alarm_name          = "${var.name}-${each.key}-unhealthy-hosts"
  alarm_description   = "${upper(each.key)} target group has unhealthy hosts"
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
    TargetGroup  = each.value.target_group_arn_suffix
  }
}

# 5xx count over 5 minutes, but only when RequestCount exceeds a floor so
# idle/low-traffic periods do not page on a handful of errors.
resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  for_each = local.alb_targets

  alarm_name          = "${var.name}-${each.key}-target-5xx"
  alarm_description   = "${upper(each.key)} ALB target 5xx with minimum request volume"
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
        TargetGroup  = each.value.target_group_arn_suffix
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
        TargetGroup  = each.value.target_group_arn_suffix
      }
    }
  }

  metric_query {
    id          = "errors_when_volume"
    expression  = "IF(requests >= 20, errors, 0)"
    label       = each.value.label
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
# RDS — the dependency the app cannot report on itself
# -------------------------------------------------------------------------

locals {
  db_alarms_enabled = var.db_instance_identifier == "" ? 0 : 1
}

# Storage first, because it is the one that ends in data loss rather than
# slowness: Postgres stops accepting writes on a full volume.
resource "aws_cloudwatch_metric_alarm" "db_free_storage_low" {
  count = local.db_alarms_enabled

  alarm_name          = "${var.name}-db-free-storage-low"
  alarm_description   = "RDS free storage below threshold — writes stop when it reaches zero"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Minimum"
  threshold           = var.db_free_storage_bytes_threshold
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "db_cpu_high" {
  count = local.db_alarms_enabled

  alarm_name          = "${var.name}-db-cpu-high"
  alarm_description   = "RDS CPU sustained high for 5 minutes"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

# A connection leak looks like a healthy app until it looks like a total
# outage — every request starts failing at once when the pool cannot check out.
resource "aws_cloudwatch_metric_alarm" "db_connections_high" {
  count = local.db_alarms_enabled

  alarm_name          = "${var.name}-db-connections-high"
  alarm_description   = "RDS connection count approaching the instance limit"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.db_connection_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    DBInstanceIdentifier = var.db_instance_identifier
  }
}

# -------------------------------------------------------------------------
# Log metric filters on stable `event` field (JSON logs)
# -------------------------------------------------------------------------

locals {
  # services library logs use service=aicatalyst-services but still land in
  # the hosting process log group (web or mcp).
  public_log_groups = {
    web = "/ecs/${var.web_service_name}"
    mcp = "/ecs/${var.mcp_service_name}"
  }
}

resource "aws_cloudwatch_log_metric_filter" "module_checklist_state_mismatch" {
  for_each = local.public_log_groups

  name           = "${var.name}-${each.key}-module-checklist-state-mismatch"
  log_group_name = each.value
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

output "log_groups" {
  value = {
    web = "/ecs/${var.web_service_name}"
    api = "/ecs/${var.api_service_name}"
    mcp = "/ecs/${var.mcp_service_name}"
  }
}

output "log_prefix" {
  value       = "/ecs/${var.name}"
  description = "Env-level prefix approximation; prefer log_groups for real paths."
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}
