# Security Policy

## Supported Versions

This project is in active early development. Only the latest state of the
`main` branch is supported and receives security fixes.

| Version                  | Supported |
| ------------------------ | --------- |
| `main`                   | ✅        |
| Older commits / branches | ❌        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security problems.

Report vulnerabilities privately through GitHub:

1. Go to the repository **Security** tab.
2. Choose **Report a vulnerability** (private vulnerability reporting).
3. Include a description, reproduction steps, affected area, and any suggested fix.

We aim to acknowledge reports within a few business days and will keep you
updated on remediation progress. Please allow reasonable time for a fix before
any public disclosure.

## Scope

In scope:

- The application code under `apps/` and `packages/`.
- Build, CI, and container configuration under `infra/` and `.github/`.

Out of scope:

- Third-party dependencies (report those upstream; we track updates via Dependabot).
- Issues that require access to secrets or infrastructure not committed to this repository.

## Handling Secrets

- Never commit real secrets. Use `.env` locally (git-ignored) and `.env.example` for placeholders.
- Provider/API keys must stay server-side and must never be exposed via `NEXT_PUBLIC_` variables.
