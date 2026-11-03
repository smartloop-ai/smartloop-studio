#!/usr/bin/env python3
"""
CI release publisher for Smartloop Studio.

Pushes a successful build's artifact details into the Smartloop releases API by
POSTing a draft release and then PATCHing it to `published`. Designed to be
*vendored* into the smartloop-studio repo and run from CI, so it depends on the
Python 3 standard library only (no httpx, no imports from this repo).

Auth:
    Set SLP_ADMIN_TOKEN_PROD (or SLP_ADMIN_TOKEN) in the CI environment to a
    Personal Access Token (slp_...) belonging to a verified superuser, or pass
    --token. The token is sent as `Authorization: Bearer <token>`.

Usage:
    python ci_push_release.py --file release.json
    python ci_push_release.py --file release.json --draft-only
    python ci_push_release.py --file release.json --base-url http://localhost:8888 --skip-validation

Flags:
    --file            Path to the release JSON payload (required).
    --base-url        API base URL. Default: https://api.smartloop.ai
    --token           PAT. Overrides SLP_ADMIN_TOKEN_PROD / SLP_ADMIN_TOKEN env vars.
    --skip-validation Publish with ?skip_artifact_validation=true (skips the server's
                      per-artifact HEAD check). Off by default: prod artifacts should
                      already be on the CDN and are worth validating.
    --draft-only      Create the draft but do NOT publish. Use when a human runs the
                      go-live step later (e.g. `make releases-publish-prod VERSION=...`).

Release JSON shape (matches the API's ReleaseCreate model). electron-builder emits
the per-artifact `sha512` (base64) and `size` (bytes) in its latest*.yml output; map
those straight into each artifact:

{
  "version": "1.0.15",
  "name": "Smartloop Studio 1.0.15",
  "notes": "Bug fixes and improvements",
  "channel": "stable",
  "min_version": null,
  "artifacts": [
    {
      "platform": "darwin",
      "arch": "arm64",
      "kind": "zip",
      "url": "https://cdn.smartloop.ai/releases/1.0.15/Smartloop-1.0.15-arm64-mac.zip",
      "sha512": "<base64 from electron-builder>",
      "size": 123456789
    }
  ]
}

Exit codes: 0 on success, non-zero on any failure (so CI fails loudly).
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = "https://api.smartloop.ai"
API_PREFIX = "/v1/releases"
# Identify the caller; urllib/httpx defaults look like generic bots to proxies.
USER_AGENT = "smartloop-release-ci/1.0"


def api_url(base: str) -> str:
    return f"{base.rstrip('/')}{API_PREFIX}"


def _request(method: str, url: str, token: str, payload: dict = None):
    """Make a JSON request. Returns (status_code, parsed_body)."""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", USER_AGENT)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            return resp.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {"detail": body[:500]}
    except urllib.error.URLError as e:
        print(f"Error: could not reach {url}: {e.reason}", file=sys.stderr)
        sys.exit(1)


def _detail(body) -> str:
    if isinstance(body, dict):
        return str(body.get("detail", body))
    return str(body)


def _print_release(release: dict):
    for key in ("version", "name", "channel", "status", "published_at", "min_version"):
        print(f"  {key}: {release.get(key)}")
    artifacts = release.get("artifacts", [])
    print(f"  artifacts ({len(artifacts)}):")
    for a in artifacts:
        print(f"    - {a['platform']}/{a['arch']} {a['kind']}: {a['url']} ({a['size']} bytes)")


def create_draft(base: str, token: str, payload: dict) -> dict:
    version = payload["version"]
    status, body = _request("POST", api_url(base), token, payload)
    if status in (200, 201):
        print(f"Draft release ready: {version}")
        return body
    if status == 409:
        print(
            f"Error: release {version} already exists as published/revoked and cannot "
            f"be recreated ({_detail(body)}).",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"Error creating draft {version}: HTTP {status}: {_detail(body)}", file=sys.stderr)
    sys.exit(1)


def publish(base: str, token: str, version: str, skip_validation: bool) -> dict:
    url = f"{api_url(base)}/{version}"
    if skip_validation:
        url += "?skip_artifact_validation=true"
    status, body = _request("PATCH", url, token, {"status": "published"})
    if status == 200:
        print(f"Published: {version}")
        return body
    print(f"Error publishing {version}: HTTP {status}: {_detail(body)}", file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Push a Smartloop Studio build release to the API (create + publish).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--file", required=True, help="Release JSON payload (ReleaseCreate shape)")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help=f"API base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--token", help="PAT (overrides SLP_ADMIN_TOKEN_PROD / SLP_ADMIN_TOKEN)")
    parser.add_argument("--skip-validation", action="store_true", dest="skip_validation",
                        help="Publish without the server's per-artifact HEAD validation")
    parser.add_argument("--draft-only", action="store_true", dest="draft_only",
                        help="Create the draft but do not publish")
    args = parser.parse_args()

    token = args.token or os.environ.get("SLP_ADMIN_TOKEN_PROD") or os.environ.get("SLP_ADMIN_TOKEN")
    if not token:
        print("Error: no token. Set SLP_ADMIN_TOKEN_PROD / SLP_ADMIN_TOKEN or pass --token.",
              file=sys.stderr)
        sys.exit(1)

    try:
        payload = json.loads(Path(args.file).read_text())
    except (OSError, json.JSONDecodeError) as e:
        print(f"Error reading {args.file}: {e}", file=sys.stderr)
        sys.exit(1)

    if "version" not in payload:
        print(f"Error: {args.file} is missing required 'version' field.", file=sys.stderr)
        sys.exit(1)

    draft = create_draft(args.base_url, token, payload)

    if args.draft_only:
        print("--draft-only: stopping before publish.")
        if draft:
            _print_release(draft)
        return

    release = publish(args.base_url, token, payload["version"], args.skip_validation)
    _print_release(release)


if __name__ == "__main__":
    main()
