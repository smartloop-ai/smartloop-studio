#!/usr/bin/env bash
#
# Put the chat model in build/models/, so it ships inside the installer and a
# first launch downloads nothing:
#
#   smartloop-ai/slp-orchestra-mini/<name>.gguf   ~770 MB
#
# The embedding model is not staged here: the SLP framework ships it next to its
# binary (build/slp/embeddings/) on every platform, and SLP loads that copy.
#
# The layout mirrors a workspace's models/ directory exactly, because that
# relative path is copied straight across when the app seeds a new workspace
# (ensureBootstrapModel in electron/main.js): <workspace>/models/<model_id>/.
#
# Sources, cheapest first:
#   1. already staged     — nothing to do
#   2. a local workspace  — APFS clone, instant, no network
#   3. the network        — the platform API (signed GCS URL, no account needed
#                           for a FREE model)
#
# (3) is what makes this work on a clean machine or in CI, where no one has ever
# launched the app.
set -euo pipefail

cd "$(dirname "$0")/.."

API_BASE="${VITE_BASE_URL:-https://api.smartloop.ai}"
# Locally SLP calls this model `sl-mini`; the catalogue publishes it under its
# original name, and that is what the download route answers to.
PLATFORM_NAME="${BOOTSTRAP_MODEL_NAME:-slp-orchestra-mini}"
MODEL_ID="${BOOTSTRAP_MODEL_ID:-smartloop-ai/slp-orchestra-mini}"

# Clone if the filesystem can (APFS: instant, no second copy), else copy.
clone_or_copy() {
  cp -c "$1" "$2" 2>/dev/null || cp "$1" "$2"
}

# A .gguf already sitting in this machine's workspace under <relative dir>. Same bytes as the bucket has, already
# local — so it is tried first, and the network is the fallback rather than the
# rule.
workspace_copy() {
  find "$HOME/.smartloop"/*/models/"$1" -name '*.gguf' -type f 2>/dev/null | head -1 || true
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

stage_chat_model
# Earlier runs staged the embedding model here too; the framework ships it.
rm -rf build/models/embeddings

echo "📁 build/models is $(du -sh build/models | cut -f1)"
