terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "cloudflare_r2_bucket" "pypi" {
  account_id = var.account_id
  name       = var.bucket_name
  location   = var.r2_location
}

resource "cloudflare_workers_script" "pypi" {
  account_id         = var.account_id
  script_name        = var.worker_name
  compatibility_date = var.worker_compatibility_date

  content_file   = "${path.module}/worker/worker.js"
  content_sha256 = filesha256("${path.module}/worker/worker.js")
  main_module    = "worker.js"

  bindings = [
    {
      name        = "PYPI_BUCKET"
      type        = "r2_bucket"
      bucket_name = cloudflare_r2_bucket.pypi.name
    }
  ]
}

resource "cloudflare_workers_custom_domain" "pypi_domain" {
  account_id  = var.account_id
  zone_id     = var.zone_id
  hostname    = var.hostname
  service     = cloudflare_workers_script.pypi.script_name
  environment = "production"
}
