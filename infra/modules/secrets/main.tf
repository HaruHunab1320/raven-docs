# =============================================================================
# Secret Manager Module
# =============================================================================
# References existing secrets in GCP Secret Manager
# Secrets must be created manually or via bootstrap script before first deploy
# =============================================================================

# App Secret
data "google_secret_manager_secret" "app_secret" {
  secret_id = "${var.resource_prefix}-app-secret"
  project   = var.project_id
}

# Database Password
data "google_secret_manager_secret" "db_password" {
  secret_id = "${var.resource_prefix}-db-password"
  project   = var.project_id
}

# Read the actual DB password value (needed by Cloud SQL to create user)
data "google_secret_manager_secret_version" "db_password" {
  secret  = data.google_secret_manager_secret.db_password.id
  project = var.project_id
}

# SMTP Username (optional - may not exist)
data "google_secret_manager_secret" "smtp_username" {
  count     = var.enable_smtp ? 1 : 0
  secret_id = "${var.resource_prefix}-smtp-username"
  project   = var.project_id
}

# SMTP Password (optional - may not exist)
data "google_secret_manager_secret" "smtp_password" {
  count     = var.enable_smtp ? 1 : 0
  secret_id = "${var.resource_prefix}-smtp-password"
  project   = var.project_id
}

# Postmark Token (optional - may not exist)
data "google_secret_manager_secret" "postmark_token" {
  count     = var.enable_postmark ? 1 : 0
  secret_id = "${var.resource_prefix}-postmark-token"
  project   = var.project_id
}

# Resend API Key (optional - may not exist)
data "google_secret_manager_secret" "resend_api_key" {
  count     = var.enable_resend ? 1 : 0
  secret_id = "${var.resource_prefix}-resend-api-key"
  project   = var.project_id
}

# Gemini API Key (optional - may not exist)
data "google_secret_manager_secret" "gemini_api_key" {
  count     = var.enable_gemini ? 1 : 0
  secret_id = "${var.resource_prefix}-gemini-api-key"
  project   = var.project_id
}
