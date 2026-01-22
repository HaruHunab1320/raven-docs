# =============================================================================
# Cloud Run Job for Database Migrations
# =============================================================================
# Runs migrations as a one-off job, triggered by CI/CD
# =============================================================================

resource "google_cloud_run_v2_job" "migrations" {
  name     = "${var.resource_prefix}-migrations"
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

        command = ["sh", "-c"]
        args    = ["npx kysely migrate:latest"]

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        env {
          name  = "DATABASE_URL"
          value = var.database_url
        }

        env {
          name  = "NODE_ENV"
          value = "production"
        }
      }

      max_retries = 1
      timeout     = "300s"
    }
  }

  labels = var.labels

  depends_on = [google_cloud_run_v2_service.main]
}
