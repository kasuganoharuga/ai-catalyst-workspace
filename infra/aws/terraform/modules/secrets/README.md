# module: secrets

Secrets Manager placeholders for:

| Secret | Rotation (V1 prep) |
|--------|--------------------|
| `database-url` | Plan RDS + Secrets Manager rotation later; store value only now |
| `better-auth-secret` | Manual rotation + redeploy web/mcp |
| `oauth` | Manual if used beyond Better Auth |

SES uses task-role credentials, not a static secret.
