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

# Startup script - test with completely bare container first
# If bare container crashes, it's a Memgraph/kernel incompatibility
# If bare container works, issue is with data/config/volumes
locals {
  memgraph_startup_script = <<-EOF
    #!/bin/bash
    set -e

    echo "=== Starting Memgraph debug test ==="
    date

    # Log system info
    echo "=== SYSTEM INFO ==="
    uname -a
    cat /etc/os-release | head -5
    echo "=== CPU INFO ==="
    cat /proc/cpuinfo | grep -E "model name|flags" | head -4
    echo "=== GLIBC VERSION ==="
    ldd --version | head -1
    echo "=== END SYSTEM INFO ==="

    # Set kernel parameters
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

    # Stop any existing container
    docker stop memgraph 2>/dev/null || true
    docker rm memgraph 2>/dev/null || true

    echo "=== TESTING BARE CONTAINER (no volumes, no config) ==="

    # Try different versions to find one that works
    for VERSION in "2.11.0" "2.10.1" "2.6.0"; do
      echo "=== Testing memgraph/memgraph:$VERSION ==="

      # Pull the image
      docker pull memgraph/memgraph:$VERSION

      # Run completely bare - no volumes, no user, no extra flags
      # Just the minimal container to test if it starts at all
      timeout 30 docker run --rm \
        memgraph/memgraph:$VERSION \
        --log-level=TRACE --also-log-to-stderr 2>&1 | head -50 || true

      # Check if it stayed up (run in background and check)
      docker run -d --name memgraph_test \
        -p 7687:7687 \
        memgraph/memgraph:$VERSION \
        --log-level=INFO --also-log-to-stderr

      sleep 10

      if docker ps | grep -q memgraph_test; then
        echo "=== SUCCESS: Version $VERSION works! ==="
        docker stop memgraph_test
        docker rm memgraph_test

        # Use this working version for production
        docker run -d \
          --name memgraph \
          --restart always \
          -p 7687:7687 \
          -p 7444:7444 \
          memgraph/memgraph:$VERSION \
          --log-level=INFO --also-log-to-stderr

        echo "=== Memgraph $VERSION started successfully ==="
        exit 0
      else
        echo "=== FAILED: Version $VERSION crashed ==="
        docker logs memgraph_test 2>&1 | tail -20 || true
        docker rm memgraph_test 2>/dev/null || true
      fi
    done

    echo "=== ALL VERSIONS FAILED - Check logs above ==="
    exit 1
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

  # TODO: Re-enable prevent_destroy after successful Debian migration
  # lifecycle {
  #   prevent_destroy = true
  # }

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
