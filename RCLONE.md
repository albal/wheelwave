## rclone setup (uploading WheelWave artifacts + manifest to Cloudflare R2)

WheelWave uses **Cloudflare R2** as the backing store. R2 is **S3-compatible**, so we use **rclone** (S3 backend) to sync:

- artifacts: `packages/*.whl` and `packages/*.tar.gz`
- index: `simple/manifest-v1.json`

Cloudflare’s official R2 docs include an rclone example and note you must generate an **R2 Access Key** first.

---

### 1) Install rclone

- macOS:

  ```bash
  brew install rclone
  ```

- Linux (example):

  ```bash
  curl https://rclone.org/install.sh | sudo bash
  ```

Verify:

```bash
rclone version
```

---

### 2) Create R2 credentials (Access Key + Secret)

In the Cloudflare Dashboard:

1. Go to **R2**
2. Create an **R2 Access Key** (sometimes shown as “Manage R2 API tokens / Access keys”)
3. Copy:

   - **Access Key ID**
   - **Secret Access Key** (shown once)

These are **not** the same as your Cloudflare Account ID or Cloudflare API Token. Cloudflare’s rclone doc explicitly calls out the Access Key ID + Secret Access Key for rclone. ([Cloudflare Docs][1])

---

### 3) Find your R2 S3 endpoint (uses Account ID)

Your endpoint is:

```text
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

`<ACCOUNT_ID>` is your **Cloudflare account id**, and it is used **only** in the endpoint URL (not as the access key). ([Cloudflare Docs][1])

---

### 4) Configure rclone (recommended: config file)

Create the rclone config directory and file:

```bash
mkdir -p ~/.config/rclone
nano ~/.config/rclone/rclone.conf
```

Add this remote (name it `r2`):

```ini
[r2]
type = s3
provider = Cloudflare
access_key_id = <R2_ACCESS_KEY_ID>
secret_access_key = <R2_SECRET_ACCESS_KEY>
endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
region = auto

# Important for restricted tokens:
# If your key only has object-level permissions (common), disable bucket checks
# to avoid 403 AccessDenied / CreateBucket-style failures.
no_check_bucket = true
```

Why `no_check_bucket = true`?

- If your credentials don’t allow bucket-level “check/create” actions, rclone may fail with **403 AccessDenied** while trying to confirm the bucket exists.
- rclone documents `no_check_bucket` as the way to stop it from checking/creating buckets, and community threads confirm it fixes AccessDenied “CreateBucket” style failures. ([rclone forum][2])

---

### 5) Test your rclone connection

List buckets:

```bash
rclone lsd r2:
```

List a specific bucket:

```bash
rclone lsf r2:<YOUR_BUCKET_NAME>
```

If you see `401 Unauthorized`:

- your **access_key_id / secret_access_key** are wrong (often because someone used Account ID by mistake)

If you see `403 AccessDenied` on upload:

- add `no_check_bucket = true` (above)
- or ensure your R2 key includes object write permissions for the bucket

---

### 6) Sync artifacts to R2

Assuming your local directory is `/data/packages` and it contains only `.whl` and `.tar.gz`, upload them to:

- `r2:<bucket>/packages/`

**Use `--filter` (recommended by rclone) instead of mixing include/exclude:**

```bash
rclone sync /data/packages r2:<YOUR_BUCKET_NAME>/packages \
  --filter "+ *.whl" \
  --filter "+ *.tar.gz" \
  --filter "- *" \
  --fast-list \
  --transfers 16 \
  --checkers 32
```

Notes:

- `sync` mirrors exactly (deletes remote files not present locally). If you never want deletions, use `rclone copy` instead.
- `--fast-list` improves performance for large listings (helpful when you have thousands of files).

---

### 7) Upload the manifest

WheelWave expects the manifest at:

- `simple/manifest-v1.json`

Upload it with:

```bash
rclone copyto /data/packages/manifest-v1.json \
  r2:<YOUR_BUCKET_NAME>/simple/manifest-v1.json
```

---

### 8) One-off: pass no-check-bucket on the command line (optional)

If you don’t want to edit the config file, you can add:

```bash
--s3-no-check-bucket
```

Example:

```bash
rclone copyto --s3-no-check-bucket /data/packages/manifest-v1.json \
  r2:<YOUR_BUCKET_NAME>/simple/manifest-v1.json
```

This is useful when you hit “AccessDenied CreateBucket” behavior. ([GitHub][3])

[1]: https://developers.cloudflare.com/r2/examples/rclone/?utm_source=chatgpt.com "Rclone · Cloudflare R2 docs"
[2]: https://forum.rclone.org/t/no-check-bucket-true-config-for-all-awss3-azure-blob-and-gcs-bucket-access/39318?utm_source=chatgpt.com "No_check_bucket = true config for all awss3, azure blob and GCS bucket ..."
[3]: https://github.com/rclone/rclone/issues/5119?utm_source=chatgpt.com "AccessDenied on copy to S3 bucket (due to calling ..."
