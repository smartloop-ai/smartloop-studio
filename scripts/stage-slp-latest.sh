#!/usr/bin/env bash
#
# Stage the LATEST SLP framework into build/slp/ for a bundled (MAS/mac) build,
# gated on the CDN archive's hash so we only re-download when it actually changed.
#
# Unlike `make stage-slp` (which APFS-clones whatever is installed under
# ~/.smartloop and can be stale), this fetches the published darwin-arm64
# framework from the CDN. The bucket exposes the archive's MD5 as its ETag via a
# HEAD request, so we compare that against the ETag recorded the last time we
# staged (build/slp/.archive-etag). Unchanged + a real binary already present →
# no-op. Otherwise we download (~900MB), extract, verify, and record the ETag.
#
# Env:
#   SLP_BASE_URL   CDN base (default https://dl.smartloop.ai; Makefile passes it through)
#   SLP_VERSION    framework version segment in the URL (required; Makefile passes it)
#   FORCE=1        re-download even if the ETag matches
#
# Mirrors the URL/extraction logic in electron/slp-setup.js.
set -euo pipefail

BASE_URL="${SLP_BASE_URL:-https://dl.smartloop.ai}"
BASE_URL="${BASE_URL%/}"
VERSION="${SLP_VERSION:?Set SLP_VERSION (e.g. SLP_VERSION=1.0.10)}"

# MAS ships Apple Silicon only, so we always stage darwin-arm64 here.
ARCHIVE_URL="${BASE_URL}/slp/${VERSION}/darwin-arm64-slp.tar.gz"
DEST="build/slp"
ETAG_FILE="${DEST}/.archive-etag"

echo "🔎 Checking latest SLP framework: ${ARCHIVE_URL}"

# HEAD the archive and read its ETag (GCS returns the object MD5 as the ETag).
remote_etag="$(curl -fsSLI "${ARCHIVE_URL}" | tr -d '\r' \
  | awk -F': ' 'tolower($1)=="etag"{print $2}' | tail -1 | tr -d '"')"

if [ -z "${remote_etag}" ]; then
  echo "❌ Could not read ETag from ${ARCHIVE_URL} — refusing to stage a build of unknown provenance." >&2
  exit 1
fi
echo "   remote ETag: ${remote_etag}"

if [ "${FORCE:-}" != "1" ] && [ -x "${DEST}/slp" ] && [ -f "${ETAG_FILE}" ] \
   && [ "$(cat "${ETAG_FILE}")" = "${remote_etag}" ]; then
  echo "✅ build/slp already at the latest framework (ETag matches) — skipping download."
  exit 0
fi

TMP_ARCHIVE="$(mktemp -t slp-XXXXXX.tar.gz)"
cleanup() { rm -f "${TMP_ARCHIVE}"; }
trap cleanup EXIT

echo "⬇️  Downloading framework (~$(curl -fsSLI "${ARCHIVE_URL}" | tr -d '\r' \
  | awk -F': ' 'tolower($1)=="content-length"{printf "%d", $2/1024/1024}' | tail -1)MB)…"
curl -fSL --progress-bar "${ARCHIVE_URL}" -o "${TMP_ARCHIVE}"

# Verify the download against the ETag/MD5 the bucket advertised, so a truncated
# or corrupted transfer never lands in a store build.
dl_md5="$(openssl dgst -md5 "${TMP_ARCHIVE}" | awk '{print $NF}')"
if [ "${dl_md5}" != "${remote_etag}" ]; then
  echo "❌ Download hash mismatch: got ${dl_md5}, expected ${remote_etag}." >&2
  exit 1
fi
echo "   verified MD5: ${dl_md5}"

echo "📦 Extracting into ${DEST}…"
rm -rf "${DEST}"
mkdir -p "${DEST}"

# If the archive wraps everything in a top-level slp/ dir, strip it so the
# binary lands at build/slp/slp (matches slp-setup.js and electron-builder.yml).
top_level="$(tar -tzf "${TMP_ARCHIVE}" | awk -F/ '{print $1}' | sort -u)"
strip_args=()
if [ "${top_level}" = "slp" ]; then
  strip_args=(--strip-components=1)
fi
tar -xzf "${TMP_ARCHIVE}" -C "${DEST}" "${strip_args[@]}"

if [ ! -x "${DEST}/slp" ]; then
  echo "❌ Extracted archive has no executable at ${DEST}/slp — archive layout unexpected." >&2
  exit 1
fi

# macOS: strip quarantine so the bundled binary can run.
xattr -dr com.apple.quarantine "${DEST}" 2>/dev/null || true

printf '%s' "${remote_etag}" > "${ETAG_FILE}"
echo "✅ Staged latest SLP $(du -sh "${DEST}" | cut -f1) into ${DEST} (ETag ${remote_etag})"
