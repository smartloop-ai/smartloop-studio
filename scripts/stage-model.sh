#!/usr/bin/env bash
#
# Put the bootstrap model in build/models/ so it ships inside the app and a
# first launch downloads nothing.
#
# Three sources, cheapest first:
#   1. already staged           — nothing to do
#   2. a local workspace        — APFS clone, instant, no network
#   3. the platform API         — signed GCS URL, no account needed (FREE model)
#
# (3) is what makes this work on a clean machine or in CI, where no one has ever
# launched the app. Only the .gguf is taken: the same manifest carries an
# OpenVINO build for a runtime these packages do not use.
#
# Layout under build/models/ mirrors a workspace's models/ directory exactly —
# <org>/<model>/<file>.gguf — because that relative path is copied straight
# across when the app seeds it.
set -euo pipefail

cd "$(dirname "$0")/.."

API_BASE="${VITE_BASE_URL:-https://api.smartloop.ai}"
# Locally SLP calls this model `sl-mini`; the catalogue publishes it under its
# original name, and that is what the download route answers to.
PLATFORM_NAME="${BOOTSTRAP_MODEL_NAME:-slp-orchestra-mini}"
MODEL_ID="${BOOTSTRAP_MODEL_ID:-smartloop-ai/slp-orchestra-mini}"
DEST_DIR="build/models/${MODEL_ID}"

existing="$(find "$DEST_DIR" -name '*.gguf' -type f 2>/dev/null | head -1 || true)"
if [ -n "$existing" ]; then
  echo "✅ build/models already staged ($(du -sh build/models | cut -f1))"
  exit 0
fi

mkdir -p "$DEST_DIR"

# ── 2. A workspace on this machine already has it ────────────────────────────
local_copy="$(find "$HOME/.smartloop"/*/models/${MODEL_ID} -name '*.gguf' -type f 2>/dev/null | head -1 || true)"
if [ -n "$local_copy" ]; then
  echo "📦 Cloning $(basename "$local_copy") from a local workspace..."
  cp -c "$local_copy" "$DEST_DIR/$(basename "$local_copy")" 2>/dev/null \
    || cp "$local_copy" "$DEST_DIR/$(basename "$local_copy")"
  echo "✅ Staged $(du -sh build/models | cut -f1) into build/models"
  exit 0
fi

# ── 3. Straight from the platform API ────────────────────────────────────────
echo "⬇️  No local copy — fetching $PLATFORM_NAME from $API_BASE ..."

manifest="$(curl -sf --max-time 60 "$API_BASE/v1/models/$PLATFORM_NAME/download")" || {
  echo "❌ Could not reach the download manifest at $API_BASE"
  echo "   The app will download the model on first launch instead."
  exit 1
}

read -r NAME URL <<EOF
$(printf '%s' "$manifest" | python3 -c '
import json, sys
m = json.load(sys.stdin)
arts = m.get("artifacts") or {}
# Only the .gguf. The OpenVINO files in the same manifest are for a runtime
# these builds do not ship.
gguf = next((n for n in arts if n.endswith(".gguf")), None)
if not gguf:
    sys.exit("no .gguf artifact in manifest")
print(gguf.split("/")[-1], arts[gguf])
')
EOF

if [ -z "${URL:-}" ]; then
  echo "❌ Manifest carried no .gguf artifact."
  exit 1
fi

echo "   $NAME"
# Downloaded beside the target and renamed on success, so an interrupted run
# never leaves a half file that later looks staged.
curl -fL --progress-bar --max-time 3600 "$URL" -o "$DEST_DIR/$NAME.part"
mv "$DEST_DIR/$NAME.part" "$DEST_DIR/$NAME"

echo "✅ Staged $(du -sh build/models | cut -f1) into build/models"
