output "vpc_id" {
  description = "VPC network ID"
  value       = google_compute_network.main.id
}

output "vpc_name" {
  description = "VPC network name"
  value       = google_compute_network.main.name
}

output "subnet_id" {
  description = "Subnet ID"
  value       = google_compute_subnetwork.main.id
}

output "subnet_name" {
  description = "Subnet name"
  value       = google_compute_subnetwork.main.name
}

output "vpc_connector_id" {
  description = "Serverless VPC Access Connector ID"
  value       = google_vpc_access_connector.main.id
}

output "vpc_connector_name" {
  description = "Serverless VPC Access Connector name"
  value       = google_vpc_access_connector.main.name
}

output "private_ip_range_name" {
  description = "Private IP range name for service networking"
  value       = google_compute_global_address.private_ip_range.name
}

output "private_vpc_connection" {
  description = "Private VPC connection"
  value       = google_service_networking_connection.private_vpc_connection.id
}
