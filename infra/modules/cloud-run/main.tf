# =============================================================================
# Cloud Run Module
# =============================================================================
# Deploys the Raven Docs application to Cloud Run
# =============================================================================

# Service Account for Cloud Run
resource "google_service_account" "cloud_run" {
  account_id   = "${var.resource_prefix}-run"
  project      = var.project_id
  display_name = "Cloud Run Service Account"
}

# Grant Secret Manager access
resource "google_secret_manager_secret_iam_member" "app_secret" {
  project   = var.project_id
  secret_id = var.app_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "db_password" {
  project   = var.project_id
  secret_id = var.db_password_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "smtp_username" {
  count     = var.smtp_username_id != "" ? 1 : 0
  project   = var.project_id
  secret_id = var.smtp_username_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "smtp_password" {
  count     = var.smtp_password_id != "" ? 1 : 0
  project   = var.project_id
  secret_id = var.smtp_password_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "postmark_token" {
  count     = var.postmark_token_id != "" ? 1 : 0
  project   = var.project_id
  secret_id = var.postmark_token_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "resend_api_key" {
  count     = var.resend_api_key_id != "" ? 1 : 0
  project   = var.project_id
  secret_id = var.resend_api_key_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "gemini_api_key" {
  count     = var.gemini_api_key_id != "" ? 1 : 0
  project   = var.project_id
  secret_id = var.gemini_api_key_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Grant Cloud SQL Client access
resource "google_project_iam_member" "cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Grant Cloud Storage access
resource "google_storage_bucket_iam_member" "storage_access" {
  bucket = var.storage_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "main" {
  name     = "${var.resource_prefix}-app"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # Image is managed by CI/CD pipeline (gcloud run deploy), not Terraform
  # This prevents Terraform from reverting to an old image during infra-only changes
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = var.vpc_connector
      egress    = "ALL_TRAFFIC"
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      # Health check
      startup_probe {
        http_get {
          path = "/api/health"
          port = 3000
        }
        initial_delay_seconds = 10
        period_seconds        = 10
        timeout_seconds       = 5
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/api/health"
          port = 3000
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }

      # Environment variables
      dynamic "env" {
        for_each = var.environment_variables
        content {
          name  = env.key
          value = env.value
        }
      }

      # Individual database connection variables
      env {
        name  = "DB_HOST"
        value = var.db_host
      }

      env {
        name  = "DB_PORT"
        value = var.db_port
      }

      env {
        name  = "DB_NAME"
        value = var.db_name
      }

      env {
        name  = "DB_USER"
        value = var.db_user
      }

      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = var.db_password_id
            version = "latest"
          }
        }
      }

      # Redis URL
      env {
        name  = "REDIS_URL"
        value = var.redis_url
      }

      # Memgraph URL
      env {
        name  = "MEMGRAPH_URL"
        value = var.memgraph_url
      }

      # App URL (set dynamically after creation, or use custom domain)
      env {
        name  = "APP_URL"
        value = var.app_url != "" ? var.app_url : "https://placeholder.run.app"
      }

      # Secret: APP_SECRET
      env {
        name = "APP_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.app_secret_id
            version = "latest"
          }
        }
      }

      # Secret: SMTP_USERNAME (optional)
      dynamic "env" {
        for_each = var.smtp_username_id != "" ? [1] : []
        content {
          name = "SMTP_USERNAME"
          value_source {
            secret_key_ref {
              secret  = var.smtp_username_id
              version = "latest"
            }
          }
        }
      }

      # Secret: SMTP_PASSWORD (optional)
      dynamic "env" {
        for_each = var.smtp_password_id != "" ? [1] : []
        content {
          name = "SMTP_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = var.smtp_password_id
              version = "latest"
            }
          }
        }
      }

      # Secret: POSTMARK_TOKEN (optional)
      dynamic "env" {
        for_each = var.postmark_token_id != "" ? [1] : []
        content {
          name = "POSTMARK_TOKEN"
          value_source {
            secret_key_ref {
              secret  = var.postmark_token_id
              version = "latest"
            }
          }
        }
      }

      # Secret: RESEND_API_KEY (optional)
      dynamic "env" {
        for_each = var.resend_api_key_id != "" ? [1] : []
        content {
          name = "RESEND_API_KEY"
          value_source {
            secret_key_ref {
              secret  = var.resend_api_key_id
              version = "latest"
            }
          }
        }
      }

      # Secret: GEMINI_API_KEY (optional)
      dynamic "env" {
        for_each = var.gemini_api_key_id != "" ? [1] : []
        content {
          name = "GEMINI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = var.gemini_api_key_id
              version = "latest"
            }
          }
        }
      }

      ports {
        container_port = 3000
      }

      # Mount Cloud SQL socket
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    # Cloud SQL connection
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.database_connection_name]
      }
    }

    labels = var.labels
  }

  labels = var.labels

  depends_on = [
    google_secret_manager_secret_iam_member.app_secret,
    google_secret_manager_secret_iam_member.db_password,
    google_project_iam_member.cloud_sql_client,
    google_storage_bucket_iam_member.storage_access,
  ]
}

# Allow unauthenticated access (public web app)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.main.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
