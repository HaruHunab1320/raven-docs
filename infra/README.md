# Raven Docs Infrastructure

Terraform configuration for deploying Raven Docs to Google Cloud Platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cloud Run                                │
│                      (Raven Docs App)                           │
└──────────────┬──────────────────────────────────────────────────┘
               │
               │ VPC Connector
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Private VPC                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Cloud SQL  │  │ Memorystore │  │    Compute Engine       │  │
│  │ (PostgreSQL)│  │   (Redis)   │  │      (Memgraph)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Cloud Storage                               │
│                     (File Uploads)                               │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. [Terraform](https://terraform.io) >= 1.5.0
2. [Google Cloud SDK](https://cloud.google.com/sdk)
3. A GCP project with billing enabled
4. Docker image pushed to GCR or Artifact Registry

## Quick Start

1. **Authenticate with GCP:**
   ```bash
   gcloud auth application-default login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Configure variables:**
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

3. **Build and push your Docker image:**
   ```bash
   # From the repository root
   docker build -f Dockerfile.production -t gcr.io/YOUR_PROJECT/raven-docs:latest .
   docker push gcr.io/YOUR_PROJECT/raven-docs:latest
   ```

4. **Deploy infrastructure:**
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

5. **Run database migrations:**
   ```bash
   # Connect to Cloud Run and run migrations
   # Or use Cloud Build / a CI pipeline
   ```

## Modules

| Module | Description |
|--------|-------------|
| `networking` | VPC, subnets, NAT, VPC connector |
| `cloud-sql` | PostgreSQL database |
| `memorystore` | Redis cache and job queue |
| `cloud-storage` | File upload bucket |
| `memgraph` | Graph database VM |
| `secrets` | Secret Manager configuration |
| `cloud-run` | Application deployment |

## Costs

Estimated monthly costs (us-central1, minimal config):

| Resource | Tier | ~Cost/month |
|----------|------|-------------|
| Cloud Run | 0-1 instances | $0-30 |
| Cloud SQL | db-f1-micro | ~$10 |
| Memorystore | 1GB Basic | ~$35 |
| Memgraph VM | e2-small | ~$15 |
| Cloud Storage | Standard | ~$1-5 |
| **Total** | | **~$60-95** |

For production, consider:
- Cloud SQL: `db-g1-small` or larger
- Memorystore: `STANDARD_HA` tier
- Cloud Run: `min_instances = 1` to avoid cold starts

## Remote State (Recommended)

For team collaboration, configure remote state:

```hcl
# In providers.tf, uncomment and configure:
terraform {
  backend "gcs" {
    bucket = "your-terraform-state-bucket"
    prefix = "raven-docs"
  }
}
```

Create the bucket first:
```bash
gsutil mb -l US gs://your-terraform-state-bucket
gsutil versioning set on gs://your-terraform-state-bucket
```

## Updating the Application

To deploy a new version:

```bash
# Build and push new image
docker build -f Dockerfile.production -t gcr.io/YOUR_PROJECT/raven-docs:v2 .
docker push gcr.io/YOUR_PROJECT/raven-docs:v2

# Update terraform.tfvars
container_image = "gcr.io/YOUR_PROJECT/raven-docs:v2"

# Apply
terraform apply
```

## Destroying Infrastructure

```bash
# First, disable deletion protection on Cloud SQL
terraform apply -var="db_deletion_protection=false"

# Then destroy
terraform destroy
```

## GitHub Actions CI/CD

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that:

- **On Pull Request**: Builds, lints, runs tests, and shows Terraform plan
- **On Push to Main**: Builds Docker image, pushes to GCR, applies Terraform, runs migrations

### Setup

1. **Run the setup script** to configure Workload Identity Federation:
   ```bash
   cd infra/scripts
   ./setup-github-actions.sh YOUR_PROJECT_ID YOUR_GITHUB_USERNAME raven-docs
   ```

2. **Add the secrets** printed by the script to your GitHub repository:
   - Go to Settings > Secrets and variables > Actions
   - Add each secret:
     - `GCP_PROJECT_ID`
     - `GCP_SERVICE_ACCOUNT`
     - `GCP_WORKLOAD_IDENTITY_PROVIDER`
     - `APP_SECRET` (generate with `openssl rand -hex 32`)
     - `DB_PASSWORD` (generate with `openssl rand -base64 24`)

3. **Create a GitHub Environment** named `production`:
   - Go to Settings > Environments > New environment
   - Name it `production`
   - Optionally add required reviewers for deploy approval

4. **Configure remote state** (recommended for CI/CD):
   ```bash
   # Create state bucket
   gsutil mb -l US gs://YOUR_PROJECT-terraform-state
   gsutil versioning set on gs://YOUR_PROJECT-terraform-state
   ```

   Then uncomment the backend config in `providers.tf`.

### How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Build     │────▶│ Push Image   │────▶│  Terraform   │────▶│  Migrations  │
│   & Test     │     │   to GCR     │     │    Apply     │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                   │                     │                    │
       │                   │                     │                    │
    PR only            main only             main only            main only
  (plan only)
```

## Troubleshooting

**Cloud Run can't connect to Cloud SQL:**
- Ensure the VPC connector is properly configured
- Check that the Cloud SQL instance has private IP enabled

**Migrations fail:**
- Verify DATABASE_URL is correct
- Check Cloud SQL firewall rules

**Memgraph connection issues:**
- Memgraph runs on internal IP only
- Ensure Cloud Run is using the VPC connector
