variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "resource_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}

variable "container_image" {
  description = "Container image URL"
  type        = string
}

variable "cpu" {
  description = "CPU allocation"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory allocation"
  type        = string
  default     = "1Gi"
}

variable "min_instances" {
  description = "Minimum instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum instances"
  type        = number
  default     = 10
}

variable "vpc_connector" {
  description = "VPC connector ID for private networking"
  type        = string
}

variable "environment_variables" {
  description = "Environment variables to set"
  type        = map(string)
  default     = {}
}

variable "database_connection_name" {
  description = "Cloud SQL connection name"
  type        = string
}

variable "db_host" {
  description = "Database host (socket path for Cloud SQL: /cloudsql/connection-name)"
  type        = string
}

variable "db_port" {
  description = "Database port (use 5432 even for socket connections)"
  type        = string
  default     = "5432"
}

variable "db_name" {
  description = "Database name"
  type        = string
}

variable "db_user" {
  description = "Database user"
  type        = string
}

variable "db_password_id" {
  description = "Secret Manager secret ID for database password"
  type        = string
}

variable "redis_url" {
  description = "Redis connection URL"
  type        = string
}

variable "memgraph_url" {
  description = "Memgraph Bolt connection URL"
  type        = string
}

variable "app_url" {
  description = "Application URL (optional, for custom domain)"
  type        = string
  default     = ""
}

variable "app_secret_id" {
  description = "Secret Manager secret ID for APP_SECRET"
  type        = string
}

variable "smtp_username_id" {
  description = "Secret Manager secret ID for SMTP_USERNAME"
  type        = string
  default     = ""
}

variable "smtp_password_id" {
  description = "Secret Manager secret ID for SMTP_PASSWORD"
  type        = string
  default     = ""
}

variable "postmark_token_id" {
  description = "Secret Manager secret ID for POSTMARK_TOKEN"
  type        = string
  default     = ""
}

variable "storage_bucket_name" {
  description = "Cloud Storage bucket name for file uploads"
  type        = string
}
