variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "resource_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "labels" {
  description = "Labels to apply to resources"
  type        = map(string)
  default     = {}
}

# Feature flags for optional secrets
variable "enable_smtp" {
  description = "Whether SMTP secrets exist in Secret Manager"
  type        = bool
  default     = false
}

variable "enable_postmark" {
  description = "Whether Postmark secret exists in Secret Manager"
  type        = bool
  default     = false
}

variable "enable_resend" {
  description = "Whether Resend API key exists in Secret Manager"
  type        = bool
  default     = false
}

variable "enable_gemini" {
  description = "Whether Gemini API key exists in Secret Manager"
  type        = bool
  default     = false
}
