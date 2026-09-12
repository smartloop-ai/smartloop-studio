#!/usr/bin/env bash
#
# Put the blank-project template into electron/data/ so it ships in the
# installer instead of being fetched on first launch.
#
# It is 7 KB pinned to a fixed tag, and it was the last thing a fresh install
# still needed the network for — after the framework and the model were both
# bundled, this one download was all that stood between a first launch and
# working offline. It also cannot show progress: GitHub generates release zips
# on the fly and returns content-length: 0, so the splash drew a bar it could
# never fill.
#
# electron/data/ is already shipped to Resources/data/ by electron-builder, so
# this needs no packaging change. The staged file is a build artifact and is
# gitignored — it belongs to smartloop-ai/blank-project-template, not here.
set -euo pipefail

cd "$(dirname "$0")/.."

TEMPLATE_VERSION="${TEMPLATE_VERSION:-v1.0.0}"
URL="https://github.com/smartloop-ai/blank-project-template/archive/refs/tags/${TEMPLATE_VERSION}.zip"
DEST="electron/data/templates"
FILE="$DEST/project_1.zip"

if [ -s "$FILE" ]; then
  echo "✅ Blank project template already staged ($(du -h "$FILE" | cut -f1))"
  exit 0
fi

mkdir -p "$DEST"
echo "⬇️  Fetching blank project template ${TEMPLATE_VERSION}…"
if curl -sfL --max-time 120 "$URL" -o "$FILE.part" && [ -s "$FILE.part" ]; then
  mv "$FILE.part" "$FILE"
  echo "✅ Staged $(du -h "$FILE" | cut -f1) into $FILE"
else
  rm -f "$FILE.part"
  echo "⚠️  Could not fetch the template — the app will download it on first launch."
  exit 1
fi
