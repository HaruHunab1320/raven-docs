# =============================================================================
# Cloud Run Job for Knowledge Base Seeding
# =============================================================================
# Seeds the knowledge base with documentation content.
# Triggered by CI/CD when docs change, or manually via gcloud.
# =============================================================================

resource "google_cloud_run_v2_job" "seed_knowledge" {
  name     = "${var.resource_prefix}-seed-knowledge"
  project  = var.project_id
  location = var.region

  template {
    template {
      service_account = google_service_account.cloud_run.email

      vpc_access {
        connector = var.vpc_connector
        egress    = "ALL_TRAFFIC"
      }

      containers {
        image = var.container_image

        command = ["node"]
        args    = ["dist/database/seed-knowledge.js"]

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"  # More memory for embedding operations
          }
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }

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

        # Gemini API key for embeddings
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

        env {
          name  = "GEMINI_EMBEDDING_MODEL"
          value = "gemini-embedding-001"
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

      max_retries = 1
      timeout     = "1800s"  # 30 minutes - embedding many docs takes time
    }
  }

  labels = var.labels

  depends_on = [google_cloud_run_v2_service.main]
}
