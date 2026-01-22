# =============================================================================
# Secret Manager Module
# =============================================================================
# Stores sensitive configuration in GCP Secret Manager
# =============================================================================

# App Secret
resource "google_secret_manager_secret" "app_secret" {
  secret_id = "${var.resource_prefix}-app-secret"
  project   = var.project_id
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "app_secret" {
  secret      = google_secret_manager_secret.app_secret.id
  secret_data = var.app_secret
}

# Database Password
resource "google_secret_manager_secret" "db_password" {
  secret_id = "${var.resource_prefix}-db-password"
  project   = var.project_id
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password
}

# SMTP Username (optional)
resource "google_secret_manager_secret" "smtp_username" {
  count     = var.smtp_username != "" ? 1 : 0
  secret_id = "${var.resource_prefix}-smtp-username"
  project   = var.project_id
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "smtp_username" {
  count       = var.smtp_username != "" ? 1 : 0
  secret      = google_secret_manager_secret.smtp_username[0].id
  secret_data = var.smtp_username
}

# SMTP Password (optional)
resource "google_secret_manager_secret" "smtp_password" {
  count     = var.smtp_password != "" ? 1 : 0
  secret_id = "${var.resource_prefix}-smtp-password"
  project   = var.project_id
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "smtp_password" {
  count       = var.smtp_password != "" ? 1 : 0
  secret      = google_secret_manager_secret.smtp_password[0].id
  secret_data = var.smtp_password
}

# Postmark Token (optional)
resource "google_secret_manager_secret" "postmark_token" {
  count     = var.postmark_token != "" ? 1 : 0
  secret_id = "${var.resource_prefix}-postmark-token"
  project   = var.project_id
  labels    = var.labels

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "postmark_token" {
  count       = var.postmark_token != "" ? 1 : 0
  secret      = google_secret_manager_secret.postmark_token[0].id
  secret_data = var.postmark_token
}
