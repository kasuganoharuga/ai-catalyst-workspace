# module: alb

Public Application Load Balancer with target groups for `web` (3000) and
`mcp` (8787). `api` stays private (no public TG). Pass `certificate_arn`
when ACM is ready for HTTPS listeners.
