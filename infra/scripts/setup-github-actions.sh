#!/bin/bash
# =============================================================================
# Setup Workload Identity Federation for GitHub Actions
# =============================================================================
# This script configures GCP to allow GitHub Actions to authenticate without
# service account keys (more secure).
#
# Usage: ./setup-github-actions.sh <project-id> <github-org> <github-repo>
# Example: ./setup-github-actions.sh my-project myuser raven-docs
# =============================================================================

set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <project-id> <github-org> <github-repo>}"
GITHUB_ORG="${2:?Usage: $0 <project-id> <github-org> <github-repo>}"
GITHUB_REPO="${3:?Usage: $0 <project-id> <github-org> <github-repo>}"

POOL_NAME="github-actions-pool"
PROVIDER_NAME="github-actions-provider"
SERVICE_ACCOUNT_NAME="github-actions-deploy"

echo "=== Setting up Workload Identity Federation ==="
echo "Project: $PROJECT_ID"
echo "GitHub: $GITHUB_ORG/$GITHUB_REPO"
echo ""

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="$PROJECT_ID"

# Create Workload Identity Pool
echo "Creating Workload Identity Pool..."
gcloud iam workload-identity-pools create "$POOL_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  2>/dev/null || echo "Pool already exists"

# Create Workload Identity Provider
echo "Creating Workload Identity Provider..."
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == '$GITHUB_ORG'" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  2>/dev/null || echo "Provider already exists"

# Create Service Account for GitHub Actions
echo "Creating Service Account..."
gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions Deploy" \
  2>/dev/null || echo "Service account already exists"

SERVICE_ACCOUNT_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Grant necessary roles to the service account
echo "Granting IAM roles to service account..."
ROLES=(
  "roles/run.admin"
  "roles/storage.admin"
  "roles/cloudsql.admin"
  "roles/redis.admin"
  "roles/compute.admin"
  "roles/secretmanager.admin"
  "roles/iam.serviceAccountUser"
  "roles/iam.serviceAccountAdmin"
  "roles/resourcemanager.projectIamAdmin"
  "roles/servicenetworking.networksAdmin"
  "roles/vpcaccess.admin"
)

for ROLE in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="$ROLE" \
    --quiet
done

# Allow GitHub Actions to impersonate the service account
echo "Configuring Workload Identity Federation binding..."
WORKLOAD_IDENTITY_POOL_ID=$(gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --format="value(name)")

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}"

# Get the Workload Identity Provider resource name
WORKLOAD_IDENTITY_PROVIDER=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --format="value(name)")

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Add these secrets to your GitHub repository:"
echo "  Settings > Secrets and variables > Actions > New repository secret"
echo ""
echo "┌─────────────────────────────────────────────────────────────────────┐"
echo "│ GCP_PROJECT_ID                                                      │"
echo "│ $PROJECT_ID"
echo "├─────────────────────────────────────────────────────────────────────┤"
echo "│ GCP_SERVICE_ACCOUNT                                                 │"
echo "│ $SERVICE_ACCOUNT_EMAIL"
echo "├─────────────────────────────────────────────────────────────────────┤"
echo "│ GCP_WORKLOAD_IDENTITY_PROVIDER                                      │"
echo "│ $WORKLOAD_IDENTITY_PROVIDER"
echo "├─────────────────────────────────────────────────────────────────────┤"
echo "│ APP_SECRET                                                          │"
echo "│ (generate with: openssl rand -hex 32)                               │"
echo "├─────────────────────────────────────────────────────────────────────┤"
echo "│ DB_PASSWORD                                                         │"
echo "│ (generate with: openssl rand -base64 24)                            │"
echo "└─────────────────────────────────────────────────────────────────────┘"
echo ""
echo "Optional secrets (for email):"
echo "  SMTP_USERNAME, SMTP_PASSWORD, or POSTMARK_TOKEN"
echo ""
