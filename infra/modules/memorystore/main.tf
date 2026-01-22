# =============================================================================
# Memorystore Module
# =============================================================================
# Creates a Redis instance for caching and job queues
# =============================================================================

resource "google_redis_instance" "main" {
  name               = "${var.resource_prefix}-redis"
  project            = var.project_id
  region             = var.region
  tier               = var.tier
  memory_size_gb     = var.memory_size_gb
  redis_version      = var.redis_version
  authorized_network = var.vpc_network
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  display_name = "${var.resource_prefix} Redis"

  redis_configs = {
    maxmemory-policy = "allkeys-lru"
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 4
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  labels = var.labels
}
