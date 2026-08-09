# Observability module

Shared SNS topic + P0 CloudWatch alarms for an environment (staging today).

Per-service log groups remain owned by `ecs_service` (`/ecs/<service-name>`).
This module adds:

- SNS topic (optional email subscription via `alarm_email`)
- ALB unhealthy host alarms
- ALB target 5xx alarms with **minimum request volume** (`IF(requests >= 20, errors, 0)`)
- ECS CPU / memory alarms with a **sustained 5-minute** window (`period=60` × `evaluation_periods=5`)
- ECS running task count alarms
- Log metric filters on stable JSON `event` names (`module_checklist_state_mismatch`, `mcp_tool_failed`)

API 5xx is not ALB-backed (private service); use ECS CPU/memory/running-count
plus application logs / Sentry for API failures until an internal metric exists.
