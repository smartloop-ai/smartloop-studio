#!/usr/bin/env bash
#
# Put the models the app needs to work offline in build/models/, so they ship
# inside the installer and a first launch downloads nothing.
#
# Two of them:
#   smartloop-ai/slp-orchestra-mini/<name>.gguf   ~770 MB  the chat model
#   embeddings/bge-m3-Q4_K_M.gguf                 ~418 MB  document search
#
# The layout mirrors a workspace's models/ directory exactly, because that
# relative path is copied straight across when the app seeds a new workspace
# (ensureBootstrapModel in electron/main.js). Nothing here knows what SLP does
# with them beyond where it looks: <workspace>/models/<model_id>/ for weights,
# <workspace>/models/embeddings/ for the embedding GGUF.
#
# Sources per file, cheapest first:
#   1. already staged     — nothing to do
#   2. a local workspace  — APFS clone, instant, no network
#   3. the network        — the platform API for the chat model (signed GCS URL,
#                           no account needed for a FREE model), dl.smartloop.ai
#                           for the embedding GGUF (the same object SLP itself
#                           would fetch on first index)
#
# (3) is what makes this work on a clean machine or in CI, where no one has ever
# launched the app.
#
# SKIP_EMBEDDINGS=1 leaves the embedding model out: the package drops ~418 MB
# and SLP downloads it the first time someone indexes a document.
set -euo pipefail

cd "$(dirname "$0")/.."

API_BASE="${VITE_BASE_URL:-https://api.smartloop.ai}"
# Locally SLP calls this model `sl-mini`; the catalogue publishes it under its
# original name, and that is what the download route answers to.
PLATFORM_NAME="${BOOTSTRAP_MODEL_NAME:-slp-orchestra-mini}"
MODEL_ID="${BOOTSTRAP_MODEL_ID:-smartloop-ai/slp-orchestra-mini}"
# Defaults of AppSettings.embedding_gguf_* in the backend. Change them there and
# here together, or the app ships a file SLP will not look for.
EMBEDDING_FILE="${EMBEDDING_GGUF_FILE:-bge-m3-Q4_K_M.gguf}"
EMBEDDING_BASE_URL="${EMBEDDING_GGUF_BASE_URL:-https://dl.smartloop.ai/embeddings}"

# Clone if the filesystem can (APFS: instant, no second copy), else copy.
clone_or_copy() {
  cp -c "$1" "$2" 2>/dev/null || cp "$1" "$2"
}

# A .gguf already sitting in this machine's workspace under <relative dir>,
# optionally narrowed to one filename. Same bytes as the bucket has, already
# local — so it is tried first, and the network is the fallback rather than the
# rule.
workspace_copy() {
  find "$HOME/.smartloop"/*/models/"$1" -name "${2:-*.gguf}" -type f 2>/dev/null | head -1 || true
}

# ── The chat model ───────────────────────────────────────────────────────────
stage_chat_model() {
  local dest_dir="build/models/${MODEL_ID}"

  if [ -n "$(find "$dest_dir" -name '*.gguf' -type f 2>/dev/null | head -1)" ]; then
    echo "✅ Chat model already staged ($(du -sh "$dest_dir" | cut -f1))"
    return 0
  fi

  mkdir -p "$dest_dir"

  local local_copy
  local_copy="$(workspace_copy "$MODEL_ID")"
  if [ -n "$local_copy" ]; then
    echo "📦 Cloning $(basename "$local_copy") from a local workspace..."
    clone_or_copy "$local_copy" "$dest_dir/$(basename "$local_copy")"
    echo "✅ Staged $(du -sh "$dest_dir" | cut -f1) into $dest_dir"
    return 0
  fi

  echo "⬇️  No local copy — fetching $PLATFORM_NAME from $API_BASE ..."

  local manifest
  manifest="$(curl -sf --max-time 60 "$API_BASE/v1/models/$PLATFORM_NAME/download")" || {
    echo "❌ Could not reach the download manifest at $API_BASE"
    echo "   The app will download the model on first launch instead."
    return 1
  }

  # node, not python3: this runs on the Windows runner too, where Git Bash has
  # no python3 on PATH but node is always set up (it builds the app).
  local NAME URL
  read -r NAME URL <<EOF
$(printf '%s' "$manifest" | node -e '
let s = "";
process.stdin.on("data", d => (s += d)).on("end", () => {
  const arts = (JSON.parse(s).artifacts) || {};
  // Only the .gguf. The OpenVINO files in the same manifest are for a runtime
  // these builds do not ship.
  const gguf = Object.keys(arts).find(n => n.endsWith(".gguf"));
  if (!gguf) { console.error("no .gguf artifact in manifest"); process.exit(1); }
  console.log(gguf.split("/").pop(), arts[gguf]);
});
')
EOF

  if [ -z "${URL:-}" ]; then
    echo "❌ Manifest carried no .gguf artifact."
    return 1
  fi

  echo "   $NAME"
  # Downloaded beside the target and renamed on success, so an interrupted run
  # never leaves a half file that later looks staged.
  curl -fL --progress-bar --max-time 3600 "$URL" -o "$dest_dir/$NAME.part"
  mv "$dest_dir/$NAME.part" "$dest_dir/$NAME"
  echo "✅ Staged $(du -sh "$dest_dir" | cut -f1) into $dest_dir"
}

# ── The embedding model ──────────────────────────────────────────────────────
#
# Not fatal if it cannot be staged: without it SLP downloads it the first time a
# document is indexed, and falls back to TF-IDF retrieval until it has.
stage_embedding_model() {
  local dest_dir="build/models/embeddings"
  local dest="$dest_dir/$EMBEDDING_FILE"

  if [ -s "$dest" ]; then
    echo "✅ Embedding model already staged ($(du -h "$dest" | cut -f1))"
    return 0
  fi

  mkdir -p "$dest_dir"

  # Matched by exact filename, not just "some .gguf": a workspace may hold a
  # different quantisation, and shipping one SLP does not ask for by name means
  # shipping 418 MB it will never read.
  local local_copy
  local_copy="$(workspace_copy embeddings "$EMBEDDING_FILE")"
  if [ -n "$local_copy" ]; then
    echo "📦 Cloning $(basename "$local_copy") from a local workspace..."
    clone_or_copy "$local_copy" "$dest_dir/$(basename "$local_copy")"
    echo "✅ Staged $(du -sh "$dest_dir" | cut -f1) into $dest_dir"
    return 0
  fi

  # The same GCS object SLP's own first-run download uses (AppSettings
  # .embedding_gguf_base_url), unauthenticated and beside the release archives —
  # the base model comes off the same bucket, via a signed URL from the platform
  # API. Fetching it here is what makes a clean machine or CI able to build a
  # fully offline package.
  echo "⬇️  No local copy — fetching $EMBEDDING_FILE from $EMBEDDING_BASE_URL ..."
  if curl -fL --progress-bar --max-time 3600 "$EMBEDDING_BASE_URL/$EMBEDDING_FILE" -o "$dest.part"; then
    mv "$dest.part" "$dest"
    echo "✅ Staged $(du -h "$dest" | cut -f1) into $dest"
  else
    rm -f "$dest.part"
    echo "⚠️  Could not fetch the embedding model — the app will download it the"
    echo "   first time a document is indexed."
  fi
}

stage_chat_model
if [ "${SKIP_EMBEDDINGS:-0}" = "1" ]; then
  echo "⏭️  Skipping the embedding model (SKIP_EMBEDDINGS=1)"
else
  stage_embedding_model
fi

echo "📁 build/models is $(du -sh build/models | cut -f1)"
