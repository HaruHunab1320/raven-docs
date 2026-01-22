# =============================================================================
# Networking Module
# =============================================================================
# Creates VPC, subnets, and private service access for Cloud SQL/Memorystore
# =============================================================================

# VPC Network
resource "google_compute_network" "main" {
  name                    = "${var.resource_prefix}-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
}

# Primary Subnet
resource "google_compute_subnetwork" "main" {
  name          = "${var.resource_prefix}-subnet"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = var.subnet_cidr

  private_ip_google_access = true
}

# Private IP Range for Cloud SQL and other managed services
resource "google_compute_global_address" "private_ip_range" {
  name          = "${var.resource_prefix}-private-ip"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

# Private Service Connection (for Cloud SQL, Memorystore)
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# Serverless VPC Access Connector (for Cloud Run to reach private resources)
locals {
  # VPC connector name must be max 25 chars. If resource_prefix is too long, use a shortened version.
  connector_name = var.connector_name != null ? var.connector_name : (
    length("${var.resource_prefix}-vpc-cx") <= 25
    ? "${var.resource_prefix}-vpc-cx"
    : "${substr(var.resource_prefix, 0, 17)}-vpc-cx"
  )
}

resource "google_vpc_access_connector" "main" {
  name          = local.connector_name
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.main.name
  ip_cidr_range = var.connector_cidr
  min_instances = 2
  max_instances = 3

  depends_on = [google_compute_network.main]
}

# Firewall: Allow internal traffic
resource "google_compute_firewall" "allow_internal" {
  name    = "${var.resource_prefix}-allow-internal"
  project = var.project_id
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = [var.subnet_cidr, var.connector_cidr]
}

# Firewall: Allow health checks from GCP
resource "google_compute_firewall" "allow_health_checks" {
  name    = "${var.resource_prefix}-allow-health-checks"
  project = var.project_id
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
  }

  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["allow-health-check"]
}

# Cloud Router (for NAT)
resource "google_compute_router" "main" {
  name    = "${var.resource_prefix}-router"
  project = var.project_id
  region  = var.region
  network = google_compute_network.main.id
}

# Cloud NAT (allows private instances to reach internet)
resource "google_compute_router_nat" "main" {
  name                               = "${var.resource_prefix}-nat"
  project                            = var.project_id
  router                             = google_compute_router.main.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}
