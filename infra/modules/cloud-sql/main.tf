# =============================================================================
# Cloud SQL Module
# =============================================================================
# Creates a PostgreSQL instance with private networking
# =============================================================================

resource "google_sql_database_instance" "main" {
  name             = "${var.resource_prefix}-postgres"
  project          = var.project_id
  region           = var.region
  database_version = "POSTGRES_15"

  deletion_protection = var.deletion_protection

  # Prevent Terraform from destroying the database
  lifecycle {
    prevent_destroy = true
  }

  settings {
    tier              = var.db_tier
    availability_type = var.high_availability ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_size         = var.disk_size_gb
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.private_network
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = 7
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 4 # 4 AM
      update_track = "stable"
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    user_labels = var.labels
  }

  depends_on = [var.private_ip_range_name]
}

# Database
resource "google_sql_database" "main" {
  name     = var.db_name
  project  = var.project_id
  instance = google_sql_database_instance.main.name
}

# Database User
resource "google_sql_user" "main" {
  name     = var.db_user
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  password = var.db_password
}
