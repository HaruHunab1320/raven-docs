output "instance_name" {
  description = "Memgraph VM instance name"
  value       = google_compute_instance.memgraph.name
}

output "internal_ip" {
  description = "Internal IP address"
  value       = google_compute_instance.memgraph.network_interface[0].network_ip
}

output "service_account_email" {
  description = "Memgraph VM service account email"
  value       = google_service_account.memgraph.email
}

output "bolt_url" {
  description = "Memgraph Bolt connection URL"
  value       = "bolt://${google_compute_instance.memgraph.network_interface[0].network_ip}:7687"
}
