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

# Startup script to run Memgraph 2.11.0
# Note: Versions 2.14.x and later crash with "general protection fault" on GCP
# Version 2.11.0 is confirmed working on GCP Debian 11 with Intel Skylake
locals {
  memgraph_startup_script = <<-EOF
    #!/bin/bash
    set -e

    echo "=== Starting Memgraph setup ==="
    date

    # Set kernel parameters required by Memgraph
    sysctl -w vm.max_map_count=262144
    echo "vm.max_map_count=262144" >> /etc/sysctl.conf

    # Install Docker if not present
    if ! command -v docker &> /dev/null; then
      apt-get update
      apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
      curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
      echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt-get update
      apt-get install -y docker-ce docker-ce-cli containerd.io
      systemctl enable docker
      systemctl start docker
    fi

    # Create data directory with correct permissions
    mkdir -p /var/lib/memgraph
    chown -R 101:103 /var/lib/memgraph
    chmod 755 /var/lib/memgraph

    # Stop any existing container
    docker stop memgraph 2>/dev/null || true
    docker rm memgraph 2>/dev/null || true

    # Pull and run Memgraph 2.11.0 (confirmed working on GCP)
    # Vector search is now handled by pgvector; Memgraph used only for graph operations
    docker pull memgraph/memgraph:2.11.0
    docker run -d \
      --name memgraph \
      --restart always \
      -p 7687:7687 \
      -p 7444:7444 \
      -v /var/lib/memgraph:/var/lib/memgraph \
      memgraph/memgraph:2.11.0 \
      --log-level=INFO \
      --also-log-to-stderr

    echo "=== Memgraph 2.11.0 started successfully ==="
  EOF
}

# Memgraph VM
resource "google_compute_instance" "memgraph" {
  name         = "${var.resource_prefix}-memgraph"
  project      = var.project_id
  zone         = var.zone
  machine_type = var.machine_type

  # Memgraph requires modern CPU instructions
  min_cpu_platform = "Intel Skylake"

  tags = ["memgraph", "allow-health-check"]

  lifecycle {
    prevent_destroy = true
  }

  boot_disk {
    initialize_params {
      # Use Debian instead of Container-Optimized OS for better glibc compatibility
      image = "debian-cloud/debian-11"
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
    startup-script = local.memgraph_startup_script
  }

  service_account {
    email  = google_service_account.memgraph.email
    scopes = ["cloud-platform"]
  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
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
    ports    = ["7687", "7444"] # Bolt protocol and Lab
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
