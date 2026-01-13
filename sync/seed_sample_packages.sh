#!/usr/bin/env bash
set -euo pipefail

# ---- config ----
REPO_DIR="${REPO_DIR:-./data/packages}"     # flat repo dir
NUM_PKGS="${NUM_PKGS:-3}"
NAME_PREFIX="${NAME_PREFIX:-wheelwave-sample}"
VERSION="${VERSION:-0.1.0}"

# Optional upload to R2 using rclone (set DO_UPLOAD=1 to enable)
DO_UPLOAD="${DO_UPLOAD:-0}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-pypi-artifacts}"
# ----------------

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need python3

mkdir -p "${REPO_DIR}"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

# Create an isolated venv so macOS/Homebrew PEP 668 doesn't block installs
VENV="${WORK}/.venv"
python3 -m venv "${VENV}"
# shellcheck disable=SC1091
source "${VENV}/bin/activate"
python -m pip install -q --upgrade pip build setuptools wheel

echo "[seed] writing sample packages into: ${REPO_DIR}"
echo "[seed] workdir: ${WORK}"

for i in $(seq 1 "${NUM_PKGS}"); do
  pkg="${NAME_PREFIX}-${i}"
  pkg_dir="${WORK}/${pkg}"
  mod_name="${pkg//-/_}"

  mkdir -p "${pkg_dir}/${mod_name}"

  cat > "${pkg_dir}/pyproject.toml" <<EOF
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "${pkg}"
version = "${VERSION}"
description = "Sample package for WheelWave"
readme = "README.md"
requires-python = ">=3.8"
authors = [{name = "WheelWave", email = "noreply@example.com"}]
license = {text = "MIT"}
classifiers = [
  "Programming Language :: Python :: 3",
  "License :: OSI Approved :: MIT License",
]
EOF

  cat > "${pkg_dir}/README.md" <<EOF
# ${pkg}

This is a tiny sample package published to a WheelWave repo for end-to-end testing.
EOF

  cat > "${pkg_dir}/${mod_name}/__init__.py" <<EOF
__version__ = "${VERSION}"

def hello():
    return "Hello from ${pkg}!"
EOF

  # Minimal setuptools discovery
  cat > "${pkg_dir}/setup.cfg" <<EOF
[metadata]
name = ${pkg}
version = ${VERSION}

[options]
packages = find:
EOF

  echo "[seed] building ${pkg}"
  (cd "${pkg_dir}" && python -m build -q)

  echo "[seed] copying dist artifacts to repo dir"
  cp -v "${pkg_dir}/dist/"*.whl "${REPO_DIR}/"
  cp -v "${pkg_dir}/dist/"*.tar.gz "${REPO_DIR}/"
done

echo "[seed] done. Repo now contains $(ls -1 "${REPO_DIR}" | wc -l) files."

# If build_manifest.py exists locally, run it; otherwise skip
if [[ -x "/usr/local/bin/build_manifest.py" ]]; then
  echo "[seed] building manifest"
  mkdir -p "/var/lib/pypi-index/simple"
  /usr/local/bin/build_manifest.py --src-dir "${REPO_DIR}" --out "/var/lib/pypi-index/simple/manifest-v1.json" || true
fi

if [[ "${DO_UPLOAD}" == "1" ]]; then
  need rclone
  echo "[seed] uploading to R2 via rclone (bucket=${R2_BUCKET})"

  rclone copy "${REPO_DIR}" "${RCLONE_REMOTE}:${R2_BUCKET}/packages" \
    --include "*.whl" --include "*.tar.gz" --exclude "*" \
    --fast-list --transfers 8 --checkers 16

  if [[ -f "/var/lib/pypi-index/simple/manifest-v1.json" ]]; then
    rclone copyto "/var/lib/pypi-index/simple/manifest-v1.json" \
      "${RCLONE_REMOTE}:${R2_BUCKET}/simple/manifest-v1.json"
  fi
  echo "[seed] upload complete"
fi

echo "[seed] test with:"
echo "  pip install --index-url https://<your-hostname>/simple ${NAME_PREFIX}-1"

