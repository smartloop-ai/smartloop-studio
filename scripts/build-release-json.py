#!/usr/bin/env python3
"""Build a releases API JSON payload from electron-builder latest*.yml files.

Parses the yml files produced by electron-builder (latest-mac.yml,
latest-linux.yml, latest.yml) and generates a ReleaseCreate JSON payload
suitable for POSTing to the /v1/releases endpoint.

No third-party dependencies — uses only the Python 3 standard library so it
runs cleanly in CI without installing packages.

Usage:
    python scripts/build-release-json.py \
        --cdn-base-url https://dl.smartloop.ai \
        --version 1.0.20 \
        dist/latest-mac.yml dist/latest-linux.yml dist/latest.yml

    python scripts/build-release-json.py \
        --cdn-base-url https://dl.smartloop.ai \
        --version 1.0.20 \
        --notes "Bug fixes" \
        --output release.json \
        dist/latest-mac.yml
"""
import argparse
import json
import sys
from pathlib import Path

# ── yml filename → (API platform, CDN directory) ─────────────────────────
PLATFORM_MAP = {
    "latest-mac.yml": ("darwin", "macos"),
    "latest-linux.yml": ("linux", "linux"),
    "latest.yml": ("win32", "windows"),
}

# ── file extension → API ArtifactKind ────────────────────────────────────
KIND_MAP = {
    ".dmg": "dmg",
    ".zip": "zip",
    ".exe": "nsis",
    ".appimage": "appimage",
    ".deb": "deb",
}

KNOWN_ARCHS = {"x64", "arm64", "universal"}


def _parse_yml(path: Path) -> dict:
    """Minimal parser for electron-builder's latest*.yml format.

    Extracts only the fields we need: version, releaseName, releaseNotes,
    and per-file sha512 / size / url.  Handles the yml without pulling in
    PyYAML so CI stays dependency-free.
    """
    text = path.read_text()
    lines = text.splitlines()

    version = None
    release_name = None
    release_notes = None
    files: list[dict] = []
    current_file: dict | None = None
    in_files = False

    for raw_line in lines:
        line = raw_line.rstrip()
        stripped = line.lstrip()

        # Top-level keys (no leading whitespace)
        if not line.startswith(" ") and not line.startswith("\t"):
            in_files = False
            if current_file is not None:
                files.append(current_file)
                current_file = None

            if stripped.startswith("version:"):
                version = stripped.split(":", 1)[1].strip().strip("'\"")
            elif stripped.startswith("releaseName:"):
                val = stripped.split(":", 1)[1].strip().strip("'\"")
                release_name = val if val and val != "null" else None
            elif stripped.startswith("releaseNotes:"):
                val = stripped.split(":", 1)[1].strip().strip("'\"")
                if val.startswith("["):
                    release_notes = ""  # structured notes — skip for now
                else:
                    release_notes = val if val and val != "null" else None
            elif stripped.startswith("files:"):
                in_files = True
            continue

        # Indented lines — belong to the current section
        if in_files and stripped.startswith("- url:"):
            if current_file is not None:
                files.append(current_file)
            current_file = {"url": stripped.split(":", 1)[1].strip().strip("'\"")}
        elif current_file is not None:
            if stripped.startswith("sha512:"):
                current_file["sha512"] = stripped.split(":", 1)[1].strip().strip("'\"")
            elif stripped.startswith("blockMapSize:"):
                # Check before `size:` — startswith("size:") would never match this,
                # but keep the differential-update field explicit.
                try:
                    current_file["blockMapSize"] = int(stripped.split(":", 1)[1].strip())
                except ValueError:
                    pass
            elif stripped.startswith("size:"):
                try:
                    current_file["size"] = int(stripped.split(":", 1)[1].strip())
                except ValueError:
                    pass

    if current_file is not None:
        files.append(current_file)

    return {
        "version": version,
        "releaseName": release_name,
        "releaseNotes": release_notes,
        "files": files,
    }


def _infer_arch(filename: str) -> str:
    """Extract architecture from a filename like 'studio-1.0.18-arm64.dmg'."""
    stem = Path(filename).stem
    for part in stem.split("-"):
        if part in KNOWN_ARCHS:
            return part
    return "x64"


def _infer_kind(filename: str) -> str:
    """Map a file extension to an API ArtifactKind."""
    ext = Path(filename).suffix.lower()
    kind = KIND_MAP.get(ext)
    if kind is None:
        raise ValueError(f"Unknown artifact extension: {ext} (file: {filename})")
    return kind


def build_release(
    yml_paths: list[Path],
    cdn_base_url: str,
    version: str,
    notes: str = "",
    channel: str = "stable",
) -> dict:
    """Parse electron-builder yml files and return a ReleaseCreate payload."""
    artifacts = []
    release_name = f"Smartloop Studio {version}"

    for yml_path in yml_paths:
        filename = yml_path.name
        if filename not in PLATFORM_MAP:
            print(f"Warning: skipping unknown yml file {filename}", file=sys.stderr)
            continue

        platform, cdn_dir = PLATFORM_MAP[filename]
        info = _parse_yml(yml_path)
        if info["releaseName"]:
            release_name = info["releaseName"]
        if info["releaseNotes"] and not notes:
            notes = info["releaseNotes"]

        # Index by filename for sha512 / size lookup
        lookup = {f["url"]: f for f in info["files"]}

        for file_entry in info["files"]:
            fname = file_entry["url"]
            sha512 = file_entry.get("sha512", "")
            size = file_entry.get("size", 0)
            arch = _infer_arch(fname)
            kind = _infer_kind(fname)
            url = f"{cdn_base_url.rstrip('/')}/{version}/{cdn_dir}/{fname}"

            artifact = {
                "platform": platform,
                "arch": arch,
                "kind": kind,
                "url": url,
                "sha512": sha512,
                "size": size,
            }
            # Only auto-updatable artifacts (zip/nsis/appimage) carry blockMapSize.
            # Threading it through lets the feed emit it so electron-updater does
            # differential downloads instead of falling back to a full re-download.
            block_map_size = file_entry.get("blockMapSize")
            if block_map_size is not None:
                artifact["block_map_size"] = block_map_size
            artifacts.append(artifact)

    return {
        "version": version,
        "name": release_name,
        "notes": notes,
        "channel": channel,
        "artifacts": artifacts,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Build a releases API JSON payload from electron-builder yml files.",
    )
    parser.add_argument("yml_files", nargs="+", metavar="YML",
                        help="Path(s) to latest-mac.yml, latest-linux.yml, latest.yml")
    parser.add_argument("--cdn-base-url", required=True,
                        help="CDN base URL (e.g. https://dl.smartloop.ai)")
    parser.add_argument("--version", required=True,
                        help="Release version (e.g. 1.0.20)")
    parser.add_argument("--notes", default="",
                        help="Release notes (default: empty)")
    parser.add_argument("--channel", default="stable",
                        help="Release channel (default: stable)")
    parser.add_argument("--output", "-o",
                        help="Write JSON to file instead of stdout")
    args = parser.parse_args()

    yml_paths = [Path(p) for p in args.yml_files]
    for p in yml_paths:
        if not p.exists():
            print(f"Error: {p} not found", file=sys.stderr)
            sys.exit(1)

    payload = build_release(
        yml_paths,
        cdn_base_url=args.cdn_base_url,
        version=args.version,
        notes=args.notes,
        channel=args.channel,
    )

    out = json.dumps(payload, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(out)
        print(f"Wrote release payload to {args.output}")
    else:
        print(out)


if __name__ == "__main__":
    main()
