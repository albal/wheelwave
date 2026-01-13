#!/usr/bin/env python3
import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional


def normalize_project(name: str) -> str:
    # PEP 503-ish normalization: lowercase, collapse runs of [-_.] to "-"
    return re.sub(r"[-_.]+", "-", name.strip().lower())


def project_from_filename(filename: str) -> Optional[str]:
    """
    Infer project name from standard wheel/sdist filenames.

    Wheels (PEP 427):
      {distribution}-{version}-{build?}-{python tag}-{abi tag}-{platform tag}.whl
      distribution segment is first before '-' and often uses '_' instead of '-'.

    Sdists (commonly / PEP 625):
      {name}-{version}.tar.gz
      name can contain dashes; version is last '-' segment (versions should not contain '-').
    """
    if filename.endswith(".whl"):
        base = filename[:-4]
        parts = base.split("-")
        if len(parts) < 5:
            return None
        dist = parts[0].replace("_", "-")
        return normalize_project(dist)

    if filename.endswith(".tar.gz"):
        base = filename[:-7]
        parts = base.split("-")
        if len(parts) < 2:
            return None
        dist = "-".join(parts[:-1])
        return normalize_project(dist)

    return None


def build_manifest(src_dir: Path) -> Dict:
    projects: Dict[str, List[str]] = {}

    for entry in src_dir.iterdir():
        if not entry.is_file():
            continue

        name = entry.name
        if not (name.endswith(".whl") or name.endswith(".tar.gz")):
            continue

        project = project_from_filename(name)
        if not project:
            # Skip files that don't match expected naming
            continue

        projects.setdefault(project, []).append(name)

    # Sort deterministically
    for proj in projects:
        projects[proj].sort()

    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "projects": dict(sorted(projects.items(), key=lambda kv: kv[0])),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Build manifest-v1.json for flat wheel/sdist directory")
    ap.add_argument("--src-dir", required=True, help="Source directory containing *.whl and *.tar.gz (flat)")
    ap.add_argument("--out", required=True, help="Output manifest path (e.g. /var/lib/pypi/simple/manifest-v1.json)")
    args = ap.parse_args()

    src_dir = Path(args.src_dir).resolve()
    out_path = Path(args.out).resolve()

    if not src_dir.is_dir():
        raise SystemExit(f"ERROR: src-dir is not a directory: {src_dir}")

    manifest = build_manifest(src_dir)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")

    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=False)
        f.write("\n")

    os.replace(tmp_path, out_path)
    print(f"Wrote {out_path} (projects={len(manifest['projects'])})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
