#!/usr/bin/env bash
set -euo pipefail

# ---- config ----
SRC_DIR="/data/packages"
STATE_DIR="/var/lib/pypi-index"
MANIFEST_LOCAL="${STATE_DIR}/simple/manifest-v1.json"

RCLONE_REMOTE="r2"          # name of your rclone remote
R2_BUCKET="pypi-artifacts"  # your R2 bucket name

# R2 target keys
R2_PACKAGES_PATH="${RCLONE_REMOTE}:${R2_BUCKET}/packages"
R2_MANIFEST_KEY="${RCLONE_REMOTE}:${R2_BUCKET}/simple/manifest-v1.json"

LOCK_FILE="/var/lock/pypi_r2_sync.lock"
LOG_PREFIX="[pypi_r2_sync]"
# ---------------

mkdir -p "${STATE_DIR}/simple"

echo "${LOG_PREFIX} $(date -Is) start"

# Prevent overlapping runs
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "${LOG_PREFIX} $(date -Is) another run is in progress; exiting"
  exit 0
fi

# 1) Build manifest
/usr/local/bin/build_manifest.py --src-dir "${SRC_DIR}" --out "${MANIFEST_LOCAL}"

# 2) Sync artifacts (flat -> R2 /packages)
# Use include/exclude to only ship wheels + sdists
rclone sync "${SRC_DIR}" "${R2_PACKAGES_PATH}" \
  --include "*.whl" \
  --include "*.tar.gz" \
  --exclude "*" \
  --fast-list \
  --checksum \
  --transfers 16 \
  --checkers 32 \
  --stats 30s

# 3) Upload manifest to R2 (single object)
rclone copyto "${MANIFEST_LOCAL}" "${R2_MANIFEST_KEY}" \
  --checksum \
  --stats-one-line

echo "${LOG_PREFIX} $(date -Is) done"
