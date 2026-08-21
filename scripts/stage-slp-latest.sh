#!/usr/bin/env bash
#
# Stage the LATEST SLP framework into build/slp/ for a bundled build (the mac
# dmg/MAS .pkg, or the Linux .deb the snap wraps), gated on the CDN archive's
# hash so we only re-download when it actually changed.
#
# Unlike `make stage-slp` (which APFS-clones whatever is installed under
# ~/.smartloop and can be stale), this fetches the published darwin-arm64
# framework from the CDN. A single HEAD gives us both things we need, and they do
# different jobs:
#
#   ETag          → the gate. Opaque cache validator, changes whenever the object
#                   is replaced. Compared against the ETag recorded the last time
#                   we staged (build/slp/.archive-etag): unchanged + a real binary
#                   already present → no-op, no download.
#   x-goog-hash   → the integrity check. GCS advertises the object's MD5 (and
#                   crc32c) as base64 here; we verify the downloaded bytes against
#                   the md5= value so a truncated transfer never lands in a store
#                   build.
#
# Don't collapse these into one. The ETag only *happens* to be the hex MD5 for
# simple/resumable uploads — publish the archive as a composite object and the
# ETag stops being a checksum at all, which would fail the build as "corrupt"
# when the download was fine. x-goog-hash is the documented digest, so it is the
# one we verify against; a bare 32-hex ETag is the fallback when the header is
# absent, and with neither we refuse to stage (unknown provenance).
#
# The bytes are verified against the digest advertised by the *GET* response that
# carried them, not the earlier HEAD's. Republish the archive between the two (or
# get a stale HEAD off a CDN edge) and the HEAD digest describes an object we
# never downloaded — verifying against it would fail a perfectly good transfer.
# The GET's own x-goog-hash always describes the bytes on the wire, so it is the
# authoritative check; the HEAD is only the cheap "did it change?" gate.
#
# Env:
#   SLP_BASE_URL   CDN base (default https://dl.smartloop.ai; Makefile passes it through)
#   SLP_VERSION    framework version segment in the URL (required; Makefile passes it)
#   SLP_PLATFORM   darwin | linux (default: this host's platform)
#   SLP_ARCH       arm64 | amd64  (default: this host's architecture)
#   FORCE=1        re-download even if the ETag matches
#
# Mirrors the URL/extraction logic in electron/slp-setup.js.
set -euo pipefail

BASE_URL="${SLP_BASE_URL:-https://dl.smartloop.ai}"
BASE_URL="${BASE_URL%/}"
VERSION="${SLP_VERSION:?Set SLP_VERSION (e.g. SLP_VERSION=1.1.0)}"

# Which framework to stage. Defaults to this host's own platform/arch, so a mac
# build stages darwin-arm64 and a Linux build stages linux-amd64. The MAS targets
# rely on that default and only ever run on Apple Silicon, so they are unchanged.
# Override with SLP_PLATFORM/SLP_ARCH to stage for a different platform.
# The naming mirrors detectPlatform() in electron/slp-setup.js.
case "${SLP_PLATFORM:-$(uname -s)}" in
  Darwin|darwin) PLATFORM=darwin ;;
  Linux|linux)   PLATFORM=linux ;;
  *) echo "❌ Unsupported SLP_PLATFORM '${SLP_PLATFORM:-$(uname -s)}'." >&2
     echo "   This script only stages the tar.gz platforms (darwin, linux); the" >&2
     echo "   Windows framework ships as a .zip and CI stages it its own way." >&2
     exit 1 ;;
esac
case "${SLP_ARCH:-$(uname -m)}" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64)  ARCH=amd64 ;;
  *) echo "❌ Unsupported SLP_ARCH '${SLP_ARCH:-$(uname -m)}' (expected arm64 or amd64)." >&2; exit 1 ;;
esac

ARCHIVE_URL="${BASE_URL}/slp/${VERSION}/${PLATFORM}-${ARCH}-slp.tar.gz"
DEST="build/slp"
ETAG_FILE="${DEST}/.archive-etag"

echo "🔎 Checking latest SLP framework (${PLATFORM}-${ARCH}): ${ARCHIVE_URL}"

# Decode base64 (as x-goog-hash carries it) to lowercase hex, so digests can be
# compared in the same form `openssl dgst -md5` prints. od avoids depending on
# xxd, which isn't guaranteed on minimal CI images.
b64_to_hex() { openssl base64 -d -A | od -An -tx1 | tr -d ' \n'; }

# curl -L prints a header block per redirect hop; keep only the final response's
# block so a hop's headers can't shadow the object's.
last_header_block() { tr -d '\r' | awk '/^HTTP\//{buf=""} {buf = buf $0 "\n"} END{printf "%s", buf}'; }

# header_value <name> <header-block>
header_value() { printf '%s\n' "$2" | awk -F': ' -v k="$1" 'tolower($1)==k{print $2}'; }

# The hex MD5 a response advertises for the object it describes, or empty if it
# advertises none. x-goog-hash (base64, repeated or comma-joined) is the
# documented digest; a 32-hex ETag is the fallback.
advertised_md5() {
  local b64 etag
  b64="$(header_value x-goog-hash "$1" | tr ',' '\n' | sed -n 's/^[[:space:]]*md5=//p' | tail -1)"
  if [ -n "${b64}" ]; then printf '%s' "${b64}" | b64_to_hex; return 0; fi
  etag="$(header_value etag "$1" | tail -1 | tr -d '"')"
  if printf '%s' "${etag}" | grep -qE '^[0-9a-f]{32}$'; then printf '%s' "${etag}"; fi
}

# One HEAD serves the gate, the size estimate, and the expected digest we report
# up front. The download is verified against the GET's own headers (see above).
head_headers="$(curl -fsSLI "${ARCHIVE_URL}" | last_header_block)"

remote_etag="$(header_value etag "${head_headers}" | tail -1 | tr -d '"')"
remote_bytes="$(header_value content-length "${head_headers}" | tail -1)"
expected_md5="$(advertised_md5 "${head_headers}")"

if [ -z "${expected_md5}" ]; then
  echo "❌ ${ARCHIVE_URL} advertised no usable MD5 (x-goog-hash: '$(header_value x-goog-hash "${head_headers}" | paste -sd, -)', ETag: '${remote_etag}')." >&2
  echo "   Refusing to stage a store build of unverifiable provenance." >&2
  exit 1
fi
echo "   expected MD5: ${expected_md5}"

# Gate on the ETag when the bucket sends one, else on the digest itself.
stage_marker="${remote_etag:-md5:${expected_md5}}"
echo "   stage marker: ${stage_marker}"

if [ "${FORCE:-}" != "1" ] && [ -x "${DEST}/slp" ] && [ -f "${ETAG_FILE}" ] \
   && [ "$(cat "${ETAG_FILE}")" = "${stage_marker}" ]; then
  echo "✅ build/slp already at the latest framework (marker matches) — skipping download."
  exit 0
fi

TMP_ARCHIVE="$(mktemp -t slp-XXXXXX.tar.gz)"
TMP_HEADERS="$(mktemp -t slp-hdr-XXXXXX)"
cleanup() { rm -f "${TMP_ARCHIVE}" "${TMP_HEADERS}"; }
trap cleanup EXIT

echo "⬇️  Downloading framework (~$(( ${remote_bytes:-0} / 1024 / 1024 ))MB)…"
curl -fSL --progress-bar -D "${TMP_HEADERS}" "${ARCHIVE_URL}" -o "${TMP_ARCHIVE}"

# Verify against the digest carried by the response that delivered these bytes.
# If the archive was republished since the HEAD (or the HEAD came off a stale
# edge), that digest differs from the expected one — the download is still valid,
# it's just a newer object, so verify against it and stage under its marker.
get_headers="$(last_header_block < "${TMP_HEADERS}")"
get_etag="$(header_value etag "${get_headers}" | tail -1 | tr -d '"')"
get_md5="$(advertised_md5 "${get_headers}")"

if [ -n "${get_md5}" ] && [ "${get_md5}" != "${expected_md5}" ]; then
  echo "ℹ️  Archive changed between the HEAD and the download (${expected_md5} → ${get_md5})."
  echo "   Verifying against the digest the download itself advertised."
  expected_md5="${get_md5}"
  stage_marker="${get_etag:-md5:${get_md5}}"
fi

# Verify the bytes we got against the MD5 the bucket advertised, so a truncated
# or corrupted transfer never lands in a store build.
dl_md5="$(openssl dgst -md5 "${TMP_ARCHIVE}" | awk '{print $NF}')"
if [ "${dl_md5}" != "${expected_md5}" ]; then
  echo "❌ Download hash mismatch: got ${dl_md5}, expected ${expected_md5}." >&2
  echo "   The transfer is corrupt (both the HEAD and the download's own headers disagree with the bytes)." >&2
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

printf '%s' "${stage_marker}" > "${ETAG_FILE}"
echo "✅ Staged latest SLP $(du -sh "${DEST}" | cut -f1) into ${DEST} (marker ${stage_marker}, MD5 ${dl_md5})"
