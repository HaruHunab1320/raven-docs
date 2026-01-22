output "app_secret_id" {
  description = "App secret resource ID"
  value       = google_secret_manager_secret.app_secret.id
}

output "app_secret_version" {
  description = "App secret version"
  value       = google_secret_manager_secret_version.app_secret.id
}

output "db_password_id" {
  description = "Database password secret resource ID"
  value       = google_secret_manager_secret.db_password.id
}

output "smtp_username_id" {
  description = "SMTP username secret resource ID"
  value       = var.smtp_username != "" ? google_secret_manager_secret.smtp_username[0].id : ""
}

output "smtp_password_id" {
  description = "SMTP password secret resource ID"
  value       = var.smtp_password != "" ? google_secret_manager_secret.smtp_password[0].id : ""
}

output "postmark_token_id" {
  description = "Postmark token secret resource ID"
  value       = var.postmark_token != "" ? google_secret_manager_secret.postmark_token[0].id : ""
}
