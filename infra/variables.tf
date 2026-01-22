# =============================================================================
# Project Configuration
# =============================================================================

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (e.g., production, staging)"
  type        = string
  default     = "production"
}

# =============================================================================
# Application Configuration
# =============================================================================

variable "app_name" {
  description = "Application name used for resource naming"
  type        = string
  default     = "raven-docs"
}

variable "app_domain" {
  description = "Custom domain for the application (optional)"
  type        = string
  default     = ""
}

variable "app_secret" {
  description = "Application secret for JWT signing (min 32 characters)"
  type        = string
  sensitive   = true
}

variable "jwt_token_expires_in" {
  description = "JWT token expiration time"
  type        = string
  default     = "30d"
}

# =============================================================================
# Cloud Run Configuration
# =============================================================================

variable "cloud_run_cpu" {
  description = "CPU allocation for Cloud Run (e.g., '1', '2')"
  type        = string
  default     = "1"
}

variable "cloud_run_memory" {
  description = "Memory allocation for Cloud Run (e.g., '512Mi', '1Gi', '2Gi')"
  type        = string
  default     = "1Gi"
}

variable "cloud_run_min_instances" {
  description = "Minimum number of Cloud Run instances"
  type        = number
  default     = 0
}

variable "cloud_run_max_instances" {
  description = "Maximum number of Cloud Run instances"
  type        = number
  default     = 10
}

variable "container_image" {
  description = "Container image URL (e.g., gcr.io/project/image:tag)"
  type        = string
}

# =============================================================================
# Cloud SQL Configuration
# =============================================================================

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-f1-micro"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "raven_docs"
}

variable "db_user" {
  description = "PostgreSQL database user"
  type        = string
  default     = "raven_docs"
}

variable "db_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
}

variable "db_deletion_protection" {
  description = "Enable deletion protection for Cloud SQL"
  type        = bool
  default     = true
}

# =============================================================================
# Memorystore (Redis) Configuration
# =============================================================================

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB"
  type        = number
  default     = 1
}

variable "redis_version" {
  description = "Redis version"
  type        = string
  default     = "REDIS_7_0"
}

# =============================================================================
# Cloud Storage Configuration
# =============================================================================

variable "storage_location" {
  description = "Cloud Storage bucket location"
  type        = string
  default     = "US"
}

variable "storage_class" {
  description = "Cloud Storage bucket class"
  type        = string
  default     = "STANDARD"
}

# =============================================================================
# Memgraph Configuration
# =============================================================================

variable "memgraph_machine_type" {
  description = "Machine type for Memgraph VM"
  type        = string
  default     = "e2-small"
}

variable "memgraph_disk_size_gb" {
  description = "Disk size for Memgraph VM in GB"
  type        = number
  default     = 20
}

# =============================================================================
# Email Configuration (Optional)
# =============================================================================

variable "mail_driver" {
  description = "Mail driver (smtp or postmark)"
  type        = string
  default     = "smtp"
}

variable "mail_from_address" {
  description = "From address for emails"
  type        = string
  default     = ""
}

variable "mail_from_name" {
  description = "From name for emails"
  type        = string
  default     = "Raven Docs"
}

variable "smtp_host" {
  description = "SMTP host"
  type        = string
  default     = ""
}

variable "smtp_port" {
  description = "SMTP port"
  type        = number
  default     = 587
}

variable "smtp_username" {
  description = "SMTP username"
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_password" {
  description = "SMTP password"
  type        = string
  default     = ""
  sensitive   = true
}

variable "postmark_token" {
  description = "Postmark API token"
  type        = string
  default     = ""
  sensitive   = true
}
