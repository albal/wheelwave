For **this Terraform project** (R2 bucket + Worker script + Worker Custom Domain), you’ll want a **Cloudflare API token** with these permission groups:

## Minimum Cloudflare API token permissions

### Account-level

* **Workers Scripts: Edit** — to create/update the Worker code.
* **Workers R2 Storage: Edit** — to create/manage the R2 bucket (and any R2-related config Terraform touches).

### Zone-level (for the zone that owns `packages.example.com`)

* **DNS: Edit** — Workers **Custom Domains** automatically create DNS records for you, so the token needs permission to write DNS in that zone. ([Cloudflare Docs][1])

### “Nice to have” (often required to avoid 403s in practice)

* **Zone: Read** — Terraform/provider often reads zone details as part of operations (safe to include).
* **Workers Routes: Edit** — not always needed for Custom Domains, but commonly required by tooling that manages Workers routing; if you hit a 403 on domain/route operations, add it.

> Cloudflare’s Custom Domains feature explicitly says it will “create DNS records and issue necessary certificates on your behalf,” which is why **DNS: Edit** is the key zone permission. ([Cloudflare Docs][1])

## Scope the token (recommended)

When creating the token, scope it to:

* **Include → Specific account** (your Cloudflare account)
* **Include → Specific zone** (only the zone that contains the hostname)

That keeps blast radius small.

---

## Important: rclone uses *R2 Access Keys*, not this API token

For your **server → R2 uploads**, rclone uses the **R2 S3 credentials** (Access Key ID + Secret Access Key) that you create under **R2 → Manage API tokens**. Cloudflare documents these separately from general Cloudflare API tokens. ([Cloudflare Docs][2])

---

If you tell me whether you’re using **Workers Custom Domain** (as in our Terraform) or also want Terraform to manage **extra DNS records** yourself, I’ll give you the exact “minimal” set (and what to remove).

[1]: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ "Custom Domains · Cloudflare Workers docs"
[2]: https://developers.cloudflare.com/r2/api/tokens/ "Authentication · Cloudflare R2 docs"

