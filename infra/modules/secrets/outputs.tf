output "app_secret_id" {
  description = "App secret resource ID"
  value       = data.google_secret_manager_secret.app_secret.id
}

output "db_password_id" {
  description = "Database password secret resource ID"
  value       = data.google_secret_manager_secret.db_password.id
}

output "db_password_value" {
  description = "Database password value (for Cloud SQL user creation)"
  value       = data.google_secret_manager_secret_version.db_password.secret_data
  sensitive   = true
}

output "smtp_username_id" {
  description = "SMTP username secret resource ID"
  value       = var.enable_smtp ? data.google_secret_manager_secret.smtp_username[0].id : ""
}

output "smtp_password_id" {
  description = "SMTP password secret resource ID"
  value       = var.enable_smtp ? data.google_secret_manager_secret.smtp_password[0].id : ""
}

output "postmark_token_id" {
  description = "Postmark token secret resource ID"
  value       = var.enable_postmark ? data.google_secret_manager_secret.postmark_token[0].id : ""
}

output "resend_api_key_id" {
  description = "Resend API key secret resource ID"
  value       = var.enable_resend ? data.google_secret_manager_secret.resend_api_key[0].id : ""
}

output "gemini_api_key_id" {
  description = "Gemini API key secret resource ID"
  value       = var.enable_gemini ? data.google_secret_manager_secret.gemini_api_key[0].id : ""
}
