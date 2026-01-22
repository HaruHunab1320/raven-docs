# =============================================================================
# Cloud Storage Module
# =============================================================================
# Creates a storage bucket for file uploads
# =============================================================================

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "google_storage_bucket" "main" {
  name          = "${var.resource_prefix}-uploads-${random_id.bucket_suffix.hex}"
  project       = var.project_id
  location      = var.location
  storage_class = var.storage_class
  force_destroy = var.force_destroy

  uniform_bucket_level_access = true

  versioning {
    enabled = var.versioning_enabled
  }

  lifecycle_rule {
    condition {
      age = var.lifecycle_delete_age_days
    }
    action {
      type = "Delete"
    }
  }

  # Keep noncurrent versions for 30 days
  lifecycle_rule {
    condition {
      num_newer_versions = 3
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin          = var.cors_origins
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  labels = var.labels
}

# IAM binding for Cloud Run service account (will be set by cloud-run module)
resource "google_storage_bucket_iam_member" "cloud_run_access" {
  count  = var.cloud_run_service_account != "" ? 1 : 0
  bucket = google_storage_bucket.main.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.cloud_run_service_account}"
}
