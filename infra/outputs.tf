# =============================================================================
# Application Outputs
# =============================================================================

output "app_url" {
  description = "Cloud Run service URL"
  value       = module.cloud_run.service_url
}

output "app_domain" {
  description = "Custom domain (if configured)"
  value       = var.app_domain != "" ? var.app_domain : module.cloud_run.service_url
}

# =============================================================================
# Database Outputs
# =============================================================================

output "database_instance_name" {
  description = "Cloud SQL instance name"
  value       = module.cloud_sql.instance_name
}

output "database_connection_name" {
  description = "Cloud SQL connection name for Cloud Run"
  value       = module.cloud_sql.connection_name
}

output "database_private_ip" {
  description = "Cloud SQL private IP address"
  value       = module.cloud_sql.private_ip
  sensitive   = true
}

# =============================================================================
# Redis Outputs
# =============================================================================

output "redis_host" {
  description = "Memorystore Redis host"
  value       = module.memorystore.host
  sensitive   = true
}

output "redis_port" {
  description = "Memorystore Redis port"
  value       = module.memorystore.port
}

# =============================================================================
# Storage Outputs
# =============================================================================

output "storage_bucket_name" {
  description = "Cloud Storage bucket name"
  value       = module.cloud_storage.bucket_name
}

output "storage_bucket_url" {
  description = "Cloud Storage bucket URL"
  value       = module.cloud_storage.bucket_url
}

# =============================================================================
# Memgraph Outputs
# =============================================================================

output "memgraph_internal_ip" {
  description = "Memgraph VM internal IP"
  value       = module.memgraph.internal_ip
  sensitive   = true
}

# =============================================================================
# Network Outputs
# =============================================================================

output "vpc_network_name" {
  description = "VPC network name"
  value       = module.networking.vpc_name
}

output "vpc_connector_name" {
  description = "Serverless VPC connector name"
  value       = module.networking.vpc_connector_name
}

# =============================================================================
# Service Account Outputs
# =============================================================================

output "cloud_run_service_account" {
  description = "Cloud Run service account email"
  value       = module.cloud_run.service_account_email
}
