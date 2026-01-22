# =============================================================================
# Memgraph Module
# =============================================================================
# Creates a Compute Engine VM running Memgraph (graph database)
# =============================================================================

# Service Account for Memgraph VM
resource "google_service_account" "memgraph" {
  account_id   = "${var.resource_prefix}-memgraph"
  project      = var.project_id
  display_name = "Memgraph VM Service Account"
}

# Memgraph VM
resource "google_compute_instance" "memgraph" {
  name         = "${var.resource_prefix}-memgraph"
  project      = var.project_id
  zone         = var.zone
  machine_type = var.machine_type

  tags = ["memgraph", "allow-health-check"]

  boot_disk {
    initialize_params {
      image = "cos-cloud/cos-stable"
      size  = var.disk_size_gb
      type  = "pd-ssd"
    }
  }

  network_interface {
    network    = var.vpc_network
    subnetwork = var.subnetwork
    # No external IP - access via internal network only
  }

  metadata = {
    gce-container-declaration = yamlencode({
      spec = {
        containers = [{
          image = "memgraph/memgraph:latest"
          name  = "memgraph"
          args  = ["--also-log-to-stderr"]
          volumeMounts = [{
            name      = "memgraph-data"
            mountPath = "/var/lib/memgraph"
          }]
        }]
        volumes = [{
          name = "memgraph-data"
          hostPath = {
            path = "/var/lib/memgraph"
          }
        }]
        restartPolicy = "Always"
      }
    })
  }

  service_account {
    email  = google_service_account.memgraph.email
    scopes = ["cloud-platform"]
  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  labels = var.labels

  allow_stopping_for_update = true
}

# Firewall rule for Memgraph ports (internal only)
resource "google_compute_firewall" "memgraph" {
  name    = "${var.resource_prefix}-memgraph-internal"
  project = var.project_id
  network = var.vpc_network

  allow {
    protocol = "tcp"
    ports    = ["7687", "7444"]  # Bolt protocol and Lab
  }

  source_ranges = ["10.0.0.0/8"]
  target_tags   = ["memgraph"]
}

# Persistent disk for Memgraph data (optional, for data persistence across VM recreates)
resource "google_compute_disk" "memgraph_data" {
  count   = var.use_persistent_disk ? 1 : 0
  name    = "${var.resource_prefix}-memgraph-data"
  project = var.project_id
  zone    = var.zone
  type    = "pd-ssd"
  size    = var.persistent_disk_size_gb
  labels  = var.labels
}
