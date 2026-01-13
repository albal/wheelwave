output "simple_index_url" {
  value = "https://${var.hostname}/simple/"
}

output "bucket_name" {
  value = cloudflare_r2_bucket.pypi.name
}
