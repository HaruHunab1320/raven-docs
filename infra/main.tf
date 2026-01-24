# =============================================================================
# Raven Docs - GCP Infrastructure
# =============================================================================
#
# This Terraform configuration provisions the following GCP resources:
#   - VPC Network with private service access
#   - Cloud SQL (PostgreSQL) for the database
#   - Memorystore (Redis) for caching and job queues
#   - Cloud Storage for file uploads
#   - Compute Engine VM for Memgraph (graph database)
#   - Cloud Run for the application
#   - Secret Manager for sensitive configuration
#
# =============================================================================

locals {
  resource_prefix = "${var.app_name}-${var.environment}"

  common_labels = {
    app         = var.app_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# =============================================================================
# Enable Required APIs
# =============================================================================

resource "google_project_service" "required_apis" {
  for_each = toset([
    "compute.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "vpcaccess.googleapis.com",
    "servicenetworking.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# =============================================================================
# Networking
# =============================================================================

module "networking" {
  source = "./modules/networking"

  project_id      = var.project_id
  region          = var.region
  resource_prefix = local.resource_prefix
  labels          = local.common_labels

  depends_on = [google_project_service.required_apis]
}

# =============================================================================
# Secret Manager
# =============================================================================

module "secrets" {
  source = "./modules/secrets"

  project_id      = var.project_id
  region          = var.region
  resource_prefix = local.resource_prefix
  labels          = local.common_labels

  app_secret       = var.app_secret
  db_password      = var.db_password
  smtp_username    = var.smtp_username
  smtp_password    = var.smtp_password
  postmark_token   = var.postmark_token

  depends_on = [google_project_service.required_apis]
}

# =============================================================================
# Cloud SQL (PostgreSQL)
# =============================================================================

module "cloud_sql" {
  source = "./modules/cloud-sql"

  project_id      = var.project_id
  region          = var.region
  resource_prefix = local.resource_prefix
  labels          = local.common_labels

  db_tier                = var.db_tier
  db_name                = var.db_name
  db_user                = var.db_user
  db_password            = var.db_password
  deletion_protection    = var.db_deletion_protection
  private_network        = module.networking.vpc_id
  private_ip_range_name  = module.networking.private_ip_range_name

  depends_on = [
    google_project_service.required_apis,
    module.networking,
  ]
}

# =============================================================================
# Memorystore (Redis)
# =============================================================================

module "memorystore" {
  source = "./modules/memorystore"

  project_id      = var.project_id
  region          = var.region
  resource_prefix = local.resource_prefix
  labels          = local.common_labels

  memory_size_gb   = var.redis_memory_size_gb
  redis_version    = var.redis_version
  vpc_network      = module.networking.vpc_id

  depends_on = [
    google_project_service.required_apis,
    module.networking,
  ]
}

# =============================================================================
# Cloud Storage
# =============================================================================

module "cloud_storage" {
  source = "./modules/cloud-storage"

  project_id      = var.project_id
  region          = var.region
  resource_prefix = local.resource_prefix
  labels          = local.common_labels

  location      = var.storage_location
  storage_class = var.storage_class

  depends_on = [google_project_service.required_apis]
}

# =============================================================================
# Memgraph (Compute Engine)
# =============================================================================

module "memgraph" {
  source = "./modules/memgraph"

  project_id      = var.project_id
  region          = var.region
  zone            = "${var.region}-a"
  resource_prefix = local.resource_prefix
  labels          = local.common_labels

  machine_type = var.memgraph_machine_type
  disk_size_gb = var.memgraph_disk_size_gb
  vpc_network  = module.networking.vpc_name
  subnetwork   = module.networking.subnet_name

  depends_on = [
    google_project_service.required_apis,
    module.networking,
  ]
}

# =============================================================================
# Cloud Run
# =============================================================================

module "cloud_run" {
  source = "./modules/cloud-run"

  project_id      = var.project_id
  region          = var.region
  resource_prefix = local.resource_prefix
  labels          = local.common_labels

  container_image = var.container_image
  cpu             = var.cloud_run_cpu
  memory          = var.cloud_run_memory
  min_instances   = var.cloud_run_min_instances
  max_instances   = var.cloud_run_max_instances

  vpc_connector = module.networking.vpc_connector_id

  # Environment configuration
  environment_variables = {
    NODE_ENV             = "production"
    JWT_TOKEN_EXPIRES_IN = var.jwt_token_expires_in
    STORAGE_DRIVER       = "gcs"
    GCS_BUCKET           = module.cloud_storage.bucket_name
    GCS_PROJECT_ID       = var.project_id
    MAIL_DRIVER          = var.mail_driver
    MAIL_FROM_ADDRESS    = var.mail_from_address
    MAIL_FROM_NAME       = var.mail_from_name
    SMTP_HOST            = var.smtp_host
    SMTP_PORT            = tostring(var.smtp_port)
    RESEND_API_KEY       = var.resend_api_key
    GEMINI_API_KEY       = var.gemini_api_key
    DISABLE_TELEMETRY    = "true"
  }

  # Connection strings (built from other modules)
  database_connection_name = module.cloud_sql.connection_name
  redis_url                = "redis://${module.memorystore.host}:${module.memorystore.port}"
  memgraph_url             = "bolt://${module.memgraph.internal_ip}:7687"

  # App URL (set after first deployment or use custom domain)
  app_url = var.app_url

  # Individual database connection variables (app uses these, not DATABASE_URL)
  db_host        = "/cloudsql/${module.cloud_sql.connection_name}"
  db_port        = "5432"
  db_name        = var.db_name
  db_user        = var.db_user
  db_password_id = module.secrets.db_password_id

  # Secret references
  app_secret_id     = module.secrets.app_secret_id
  smtp_username_id  = module.secrets.smtp_username_id
  smtp_password_id  = module.secrets.smtp_password_id
  postmark_token_id = module.secrets.postmark_token_id

  # Storage service account for GCS access
  storage_bucket_name = module.cloud_storage.bucket_name

  depends_on = [
    google_project_service.required_apis,
    module.networking,
    module.cloud_sql,
    module.memorystore,
    module.cloud_storage,
    module.memgraph,
    module.secrets,
  ]
}
