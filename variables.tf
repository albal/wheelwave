variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "account_id" {
  type = string
}

variable "zone_id" {
  type = string
}

# e.g. "packages.example.com"
variable "hostname" {
  type = string
}

variable "bucket_name" {
  type    = string
  default = "pypi-artifacts"
}

# e.g. "WEUR"
variable "r2_location" {
  type    = string
  default = "WEUR"
}

variable "worker_name" {
  type    = string
  default = "pypi-simple-manifest"
}

variable "worker_compatibility_date" {
  type    = string
  default = "2025-11-01"
}
