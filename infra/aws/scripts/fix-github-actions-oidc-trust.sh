#!/usr/bin/env bash
# Repair the GitHub Actions → AWS OIDC trust for the deploy role.
#
# Failure mode this targets (Actions log):
#   Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity
#
# Confirmed minted claims from a failing develop deploy (2026-08-02):
#   sub = repo:Torus-Group/ai-catalyst-workspace:ref:refs/heads/develop
#   aud = sts.amazonaws.com
#   iss = https://token.actions.githubusercontent.com
#
# A job that declares `environment:` mints a DIFFERENT subject — the
# environment replaces the ref entirely, it is not appended to it:
#   sub = repo:Torus-Group/ai-catalyst-workspace:environment:staging
# which is why reset-staging-db.yml (the only workflow with an
# `environment:` block) failed here on 2026-08-07 while deploy-aws.yml,
# running from the same branch with the same role, kept working. Both
# subject shapes are allowed below.
#
# Usage (from a shell with credentials for account 765332581489):
#   bash infra/aws/scripts/fix-github-actions-oidc-trust.sh
set -euo pipefail

ACCOUNT_ID="${AWS_ACCOUNT_ID:-765332581489}"
ROLE_NAME="${AWS_ROLE_NAME:-ai-catalyst-github-actions-deploy}"
OIDC_URL="token.actions.githubusercontent.com"
OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_URL}"
REPO="Torus-Group/ai-catalyst-workspace"
# Org / repo numeric ids (immutable form) — accepted alongside classic slugs
# so a future opt-in to GitHub's immutable subject claim does not break deploys.
ORG_ID="296493582"
REPO_ID="1287733612"

echo "Caller identity:"
aws sts get-caller-identity

echo
echo "Ensuring OIDC provider ${OIDC_PROVIDER_ARN} exists..."
if ! aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${OIDC_PROVIDER_ARN}" >/dev/null 2>&1; then
  echo "Creating OIDC provider for ${OIDC_URL}..."
  # Thumbprint is ignored by AWS for this IdP today but still required by the API.
  aws iam create-open-id-connect-provider \
    --url "https://${OIDC_URL}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "ffffffffffffffffffffffffffffffffffffffff"
else
  echo "OIDC provider already present."
fi

TRUST_FILE="$(mktemp)"
trap 'rm -f "${TRUST_FILE}"' EXIT

cat > "${TRUST_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "${OIDC_PROVIDER_ARN}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${OIDC_URL}:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "${OIDC_URL}:sub": [
            "repo:${REPO}:ref:refs/heads/develop",
            "repo:${REPO}:ref:refs/heads/main",
            "repo:${REPO}:environment:staging",
            "repo:Torus-Group@${ORG_ID}/ai-catalyst-workspace@${REPO_ID}:ref:refs/heads/develop",
            "repo:Torus-Group@${ORG_ID}/ai-catalyst-workspace@${REPO_ID}:ref:refs/heads/main",
            "repo:Torus-Group@${ORG_ID}/ai-catalyst-workspace@${REPO_ID}:environment:staging"
          ]
        }
      }
    }
  ]
}
EOF

echo
echo "Current trust policy on ${ROLE_NAME}:"
aws iam get-role --role-name "${ROLE_NAME}" --query 'Role.AssumeRolePolicyDocument' --output json || {
  echo "Role ${ROLE_NAME} is missing — create it before re-running this script." >&2
  exit 1
}

echo
echo "Updating trust policy..."
aws iam update-assume-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-document "file://${TRUST_FILE}"

echo
echo "Updated trust policy:"
aws iam get-role --role-name "${ROLE_NAME}" --query 'Role.AssumeRolePolicyDocument' --output json

echo
echo "Done. Re-run whichever workflow failed, e.g.:"
echo "  gh workflow run 'Deploy to AWS' --ref develop"
echo "  gh workflow run 'Reset Staging Database' --ref develop -f confirm='RESET STAGING'"
