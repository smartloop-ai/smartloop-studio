#!/usr/bin/env python3
"""
Release admin for Smartloop Studio — pull a faulty build off the update feed
and put a corrected one in its place.

Companion to ci_push_release.py, which only ever moves a release forward
(draft -> published). This script covers the recovery path: inspect a release,
revoke it, and replace its artifacts. Standard library only, same as its
companion, so it runs anywhere CI does.

Auth:
    Set SLP_ADMIN_TOKEN_PROD (or SLP_ADMIN_TOKEN) to a Personal Access Token
    (slp_...) belonging to a verified superuser, or pass --token. Sent as
    `Authorization: Bearer <token>`.

Commands:
    status   <version>                    Show a release's current state.
    draft    <version>                    Send it back to draft (unblocks a CI re-run).
    revoke   <version>                    Pull it from the feed (status -> revoked).
    publish  <version>                    Move it to published.
    replace  <version> --file rel.json    Revoke, then repoint at new artifacts.

    python scripts/release_admin.py status 1.0.37
    python scripts/release_admin.py draft 1.0.37
    python scripts/release_admin.py revoke 1.0.37
    python scripts/release_admin.py replace 1.0.37 --file release.json

RE-RUNNING THE RELEASE WORKFLOW OVER AN EXISTING VERSION
=======================================================
Use `draft`, not `revoke`. build-and-deploy.yml's "Guard against overwriting an
existing release" step fails on published AND revoked alike, so revoking does not
unblock a re-run — only draft (or a version the API has never seen) gets past it,
even with overwrite=true. Draft also avoids the 409 in ci_push_release.py's
create_draft at the final stage, which refuses to recreate a published or revoked
release. So the sequence for replacing a build under the same version number is:

    1. release_admin.py draft <version>
    2. re-run Build and Deploy with overwrite=true (and publish=true to go live)

Sending a published release back to draft takes it off the feed immediately: the
update endpoint only serves published releases, so clients fall back to the last
published version below it.

READ THIS BEFORE REPLACING A PUBLISHED VERSION
==============================================
Every client already on a release holds the sha512 the feed advertised for it.
Swapping the bytes behind a published version without changing its number leaves
those clients checking a hash that no longer matches anything, and their updates
fail with an integrity error — silently, in the background, with no path out but
a manual reinstall. This is why build-and-deploy.yml refuses to overwrite the
artifacts of a published or revoked version.

Replacing in place is therefore only safe while a release is still fresh enough
that effectively nobody has taken it:

  SAFE     the release is a draft (never advertised — no client has ever seen it)
  SAFE     published minutes ago, CDN files already corrected, no client polled yet
  UNSAFE   published long enough for clients to have picked it up

When in doubt, the recovery with no failure mode is: revoke the bad version and
publish a NEW version number. Users on the bad build move forward to the fix
instead of sideways into a hash mismatch. `replace` warns and requires
confirmation; --yes skips the prompt for CI.

The CDN files are NOT touched by this script. Correct those first (re-upload to
the bucket), then run this to point the feed at them.

Exit codes: 0 on success, non-zero on any failure.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = "https://api.smartloop.ai"
# Identify the caller; urllib/httpx defaults look like generic bots to proxies.
USER_AGENT = "smartloop-release-admin/1.0"
API_PREFIX = "/v1/releases"

# Lifecycle from the API's ReleaseStatus enum: draft -> published -> (revoked).
STATUS_DRAFT = "draft"
STATUS_PUBLISHED = "published"
STATUS_REVOKED = "revoked"


def api_url(base: str, version: str = "") -> str:
    url = f"{base.rstrip('/')}{API_PREFIX}"
    return f"{url}/{version}" if version else url


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


def fetch(base: str, token: str, version: str, required: bool = True):
    """Read one release. Returns the body, or None when absent and not required."""
    status, body = _request("GET", api_url(base, version), token)
    if status == 200:
        return body
    if status == 404:
        if not required:
            return None
        print(f"Error: no release {version} on {base}.", file=sys.stderr)
        sys.exit(1)
    print(f"Error reading {version}: HTTP {status}: {_detail(body)}", file=sys.stderr)
    sys.exit(1)


def set_status(base: str, token: str, version: str, new_status: str,
               skip_validation: bool = False, extra: dict = None) -> dict:
    """PATCH a release's status, optionally alongside other fields (artifacts)."""
    url = api_url(base, version)
    if skip_validation:
        url += "?skip_artifact_validation=true"
    payload = dict(extra or {})
    payload["status"] = new_status
    status, body = _request("PATCH", url, token, payload)
    if status == 200:
        return body
    print(f"Error setting {version} to {new_status}: HTTP {status}: {_detail(body)}",
          file=sys.stderr)
    if extra:
        # The companion script only ever PATCHes {"status": ...}; sending artifacts
        # alongside is the one call here whose support we cannot confirm from the
        # public schema. Say so plainly rather than leaving a bare HTTP error.
        print(
            "\nThe PATCH included new artifacts. If the API rejected the field rather\n"
            "than the values, it does not support repointing a release in place —\n"
            "publish a new version number instead (see --help).",
            file=sys.stderr,
        )
    sys.exit(1)


def confirm(prompt: str, assume_yes: bool):
    if assume_yes:
        return
    if not sys.stdin.isatty():
        print("Error: refusing to proceed without confirmation. Pass --yes for non-interactive use.",
              file=sys.stderr)
        sys.exit(1)
    if input(f"{prompt} [y/N] ").strip().lower() not in ("y", "yes"):
        print("Aborted.")
        sys.exit(1)


def cmd_status(args, base, token):
    release = fetch(base, token, args.version)
    print(f"Release {args.version} on {base}:")
    _print_release(release)


def cmd_revoke(args, base, token):
    release = fetch(base, token, args.version)
    current = release.get("status")
    if current == STATUS_REVOKED:
        print(f"{args.version} is already revoked — nothing to do.")
        return
    print(f"Release {args.version} is currently {current}:")
    _print_release(release)
    if args.dry_run:
        print(f"\n--dry-run: would PATCH {args.version} to {STATUS_REVOKED}.")
        return
    confirm(f"\nRevoke {args.version}? Clients will stop being offered it.", args.yes)
    _print_release(set_status(base, token, args.version, STATUS_REVOKED))
    print(f"Revoked: {args.version}")


def cmd_draft(args, base, token):
    """Send a release back to draft so CI will overwrite it.

    Deliberately separate from revoke: the two look interchangeable ("take it off
    the feed") but only draft clears the CI guard, which treats revoked exactly
    like published.
    """
    release = fetch(base, token, args.version)
    current = release.get("status")
    if current == STATUS_DRAFT:
        print(f"{args.version} is already a draft — a re-run with overwrite=true will pass the guard.")
        return
    print(f"Release {args.version} is currently {current}:")
    _print_release(release)
    if args.dry_run:
        print(f"\n--dry-run: would PATCH {args.version} to {STATUS_DRAFT}.")
        return
    if current == STATUS_PUBLISHED:
        print(
            f"\nNOTE: {args.version} is published. Sending it back to draft takes it off\n"
            f"the update feed — clients will be offered the last published version below\n"
            f"it until this one is republished."
        )
    confirm(f"\nSend {args.version} back to {STATUS_DRAFT}?", args.yes)
    _print_release(set_status(base, token, args.version, STATUS_DRAFT))
    print(f"Back to draft: {args.version}")
    print("A re-run of Build and Deploy with overwrite=true will now pass the guard.")


def cmd_publish(args, base, token):
    release = fetch(base, token, args.version)
    current = release.get("status")
    if current == STATUS_PUBLISHED:
        print(f"{args.version} is already published — nothing to do.")
        return
    if args.dry_run:
        print(f"--dry-run: would PATCH {args.version} ({current}) to {STATUS_PUBLISHED}.")
        return
    if current == STATUS_REVOKED:
        confirm(f"{args.version} was revoked. Publish it again?", args.yes)
    _print_release(set_status(base, token, args.version, STATUS_PUBLISHED, args.skip_validation))
    print(f"Published: {args.version}")


def cmd_replace(args, base, token):
    """Revoke a faulty release, then repoint that version at corrected artifacts.

    Revoke lands first and on its own: it is the urgent half (it stops the bad
    build being handed out) and it stays correct even if the repoint fails.
    """
    try:
        payload = json.loads(Path(args.file).read_text())
    except (OSError, json.JSONDecodeError) as e:
        print(f"Error reading {args.file}: {e}", file=sys.stderr)
        sys.exit(1)

    if payload.get("version") != args.version:
        print(f"Error: {args.file} is for version {payload.get('version')!r}, "
              f"not {args.version!r}. Refusing to publish a mismatched payload.",
              file=sys.stderr)
        sys.exit(1)
    if not payload.get("artifacts"):
        print(f"Error: {args.file} has no artifacts.", file=sys.stderr)
        sys.exit(1)

    release = fetch(base, token, args.version)
    current = release.get("status")
    print(f"Release {args.version} is currently {current}:")
    _print_release(release)
    print(f"\nReplacing with {len(payload['artifacts'])} artifact(s) from {args.file}:")
    for a in payload["artifacts"]:
        print(f"    - {a['platform']}/{a['arch']} {a['kind']}: {a['url']} ({a['size']} bytes)")

    if args.dry_run:
        print(f"\n--dry-run: would revoke {args.version}, then PATCH it to "
              f"{STATUS_PUBLISHED} with the artifacts above.")
        return

    if current == STATUS_PUBLISHED:
        print(
            f"\nWARNING: {args.version} is published. Any client already on it holds the\n"
            f"OLD sha512 and will fail its integrity check against the new bytes —\n"
            f"their updates break silently. This is only safe if the release is too\n"
            f"fresh for anyone to have taken it. Otherwise revoke it and publish a NEW\n"
            f"version number instead."
        )
        confirm(f"Replace the artifacts of published release {args.version} anyway?", args.yes)
    else:
        confirm(f"\nReplace artifacts of {args.version} ({current})?", args.yes)

    if current != STATUS_REVOKED:
        set_status(base, token, args.version, STATUS_REVOKED)
        print(f"Revoked: {args.version} (feed no longer offers the faulty build)")

    extra = {k: v for k, v in payload.items() if k != "version"}
    _print_release(set_status(base, token, args.version, STATUS_PUBLISHED,
                              args.skip_validation, extra))
    print(f"Republished: {args.version} with the new artifacts")


def main():
    parser = argparse.ArgumentParser(
        description="Inspect, revoke, and replace Smartloop Studio releases.",
        epilog="Replacing a published version in place can break updates for clients "
               "already on it — see the module docstring.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help=f"API base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--token", help="PAT (overrides SLP_ADMIN_TOKEN_PROD / SLP_ADMIN_TOKEN)")
    parser.add_argument("--dry-run", action="store_true", dest="dry_run",
                        help="Show what would change without writing anything")
    parser.add_argument("--yes", "-y", action="store_true",
                        help="Skip confirmation prompts (for CI)")

    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("status", help="Show a release's current state")
    p.add_argument("version")
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("draft", help="Send a release back to draft (unblocks a CI re-run)")
    p.add_argument("version")
    p.set_defaults(func=cmd_draft)

    p = sub.add_parser("revoke", help="Pull a release from the update feed")
    p.add_argument("version")
    p.set_defaults(func=cmd_revoke)

    p = sub.add_parser("publish", help="Move a draft (or revoked) release to published")
    p.add_argument("version")
    p.add_argument("--skip-validation", action="store_true", dest="skip_validation",
                   help="Publish without the server's per-artifact HEAD check")
    p.set_defaults(func=cmd_publish)

    p = sub.add_parser("replace", help="Revoke, then repoint a version at new artifacts")
    p.add_argument("version")
    p.add_argument("--file", required=True,
                   help="Release JSON for the SAME version (build-release-json.py output)")
    p.add_argument("--skip-validation", action="store_true", dest="skip_validation",
                   help="Republish without the server's per-artifact HEAD check")
    p.set_defaults(func=cmd_replace)

    args = parser.parse_args()

    token = args.token or os.environ.get("SLP_ADMIN_TOKEN_PROD") or os.environ.get("SLP_ADMIN_TOKEN")
    if not token:
        print("Error: no token. Set SLP_ADMIN_TOKEN_PROD / SLP_ADMIN_TOKEN or pass --token.",
              file=sys.stderr)
        sys.exit(1)

    args.func(args, args.base_url, token)


if __name__ == "__main__":
    main()
