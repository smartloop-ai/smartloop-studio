#!/usr/bin/env bash
#
# Pull everything a first launch would otherwise fetch from behind the splash:
# the bootstrap model (sl-mini, ~770 MB) and the blank-project template.
#
# Why this exists: on a fresh ~/.smartloop the app starts SLP, finds no model
# and no project, and holds the splash through the download — several minutes
# before a dev run reaches a window, every time state is reset (`make test`
# wipes it). Doing it here means `make electron-dev` starts against a workspace
# that is already set up, so the app adopts the healthy service and goes
# straight to the main window.
#
# Idempotent and cheap when there is nothing to do: it asks the service what it
# already has and exits. Never fatal — a failure here just means the app falls
# back to downloading on the splash, which is what it did before.
set -uo pipefail

# Every wait in here is bounded: this script gates `make electron-dev`, so it
# must always hand control back rather than leave a dev run looking hung.
# SKIP_PREFETCH=1 opts out completely.
START_TIMEOUT="${PREFETCH_START_TIMEOUT:-45}"
BOOTSTRAP_TIMEOUT="${PREFETCH_BOOTSTRAP_TIMEOUT:-1800}"

if [ "${SKIP_PREFETCH:-0}" = "1" ]; then
  echo "ℹ️  SKIP_PREFETCH=1 — leaving setup to the app."
  exit 0
fi

SLP_VERSION="${SLP_VERSION:-1.2.4}"
SLP_HOME="${SMARTLOOP_HOME:-$HOME/.smartloop}"
PORT_FILE="$SLP_HOME/server.port"
TEMPLATE_VERSION="v1.0.0"
TEMPLATE_URL="https://github.com/smartloop-ai/blank-project-template/archive/refs/tags/${TEMPLATE_VERSION}.zip"
TEMPLATE_PATH="$SLP_HOME/templates/project_1.zip"

say() { printf '%s\n' "$*"; }

# Run in place from the staged framework when there is one, so a dev run
# exercises the same binary the packaged app ships.
if [ -x "build/slp/slp" ]; then
  SLP_BIN="build/slp/slp"
elif [ -x "$SLP_HOME/$SLP_VERSION/slp" ]; then
  SLP_BIN="$SLP_HOME/$SLP_VERSION/slp"
else
  say "ℹ️  No SLP framework yet — skipping prefetch; the app will set itself up on first launch."
  exit 0
fi

service_port() { [ -f "$PORT_FILE" ] && cat "$PORT_FILE" 2>/dev/null; }

healthy() {
  local p; p="$(service_port)" || return 1
  [ -n "$p" ] || return 1
  curl -sf --max-time 3 "http://127.0.0.1:$p/health" >/dev/null 2>&1
}

# ── 1. Template ──────────────────────────────────────────────────────────────
# Independent of the service, so fetch it whether or not the agent comes up.
if [ -s "$TEMPLATE_PATH" ]; then
  say "✅ Blank project template already cached"
else
  say "📦 Fetching blank project template..."
  mkdir -p "$(dirname "$TEMPLATE_PATH")"
  if curl -sfL --max-time 120 "$TEMPLATE_URL" -o "$TEMPLATE_PATH.part" && [ -s "$TEMPLATE_PATH.part" ]; then
    mv "$TEMPLATE_PATH.part" "$TEMPLATE_PATH"
    say "✅ Template cached"
  else
    rm -f "$TEMPLATE_PATH.part"
    say "⚠️  Template fetch failed — the app will retry on launch."
  fi
fi

# ── 2. Workspace + bootstrap model ───────────────────────────────────────────
STARTED_HERE=0
if healthy; then
  say "✅ SLP already running on port $(service_port)"
else
  say "🚀 Starting SLP to prepare the workspace..."
  # Detached, never in the foreground. `agent start` does not reliably return
  # promptly on a cold workspace, and this script is a prerequisite of
  # `make electron-dev` — blocking here blocks the whole dev loop.
  ( "$SLP_BIN" agent start >/dev/null 2>&1 & ) >/dev/null 2>&1
  STARTED_HERE=1
  for i in $(seq 1 "$START_TIMEOUT"); do
    healthy && break
    # Say something every 10s so a slow start does not look like a hang.
    if [ $((i % 10)) -eq 0 ]; then say "   still waiting for SLP (${i}s)..."; fi
    sleep 1
  done
  if ! healthy; then
    say "⚠️  SLP did not come up within ${START_TIMEOUT}s — skipping prefetch."
    say "   Starting the app anyway; it will set itself up on the splash."
    exit 0
  fi
fi

PORT="$(service_port)"
BASE="http://127.0.0.1:$PORT"

# The same two questions the app's checkNeedsBootstrap asks. If both already
# hold, bootstrap is a no-op and there is nothing to download.
PROJECTS="$(curl -sf --max-time 5 "$BASE/v1/projects" || echo '[]')"
HEALTH="$(curl -sf --max-time 5 "$BASE/health" || echo '{}')"
if printf '%s' "$PROJECTS" | grep -q '"id"' && printf '%s' "$HEALTH" | grep -q '"healthy"'; then
  say "✅ Workspace already has a model and a project — nothing to download"
  exit 0
fi

say "⬇️  Downloading the bootstrap model (sl-mini, ~770 MB). This runs once."
say "   (skip with SKIP_PREFETCH=1 make electron-dev)"
# /v1/bootstrap streams SSE: creates the workspace, pulls the model, makes the
# default project. Same endpoint the splash drives, so the app finds nothing
# left to do. Progress is reduced to one line per 10% so it doesn't flood.
curl -sN --max-time "$BOOTSTRAP_TIMEOUT" -X POST "$BASE/v1/bootstrap" -H 'Content-Type: application/json' \
  | python3 -u -c '
import json, sys
last = -1
for line in sys.stdin:
    if not line.startswith("data: "):
        continue
    try:
        d = json.loads(line[6:])
    except ValueError:
        continue
    pct = None
    if d.get("total"):
        pct = int(d["downloaded"] * 100 / d["total"])
    elif d.get("progress") is not None:
        pct = int(d["progress"])
    if pct is not None and pct // 10 > last // 10:
        last = pct
        print(f"    {pct:3d}%", flush=True)
    elif pct is None and d.get("status"):
        print(f"    {d[\"status\"]}", flush=True)
'

if printf '%s' "$(curl -sf --max-time 5 "$BASE/v1/projects" || echo '[]')" | grep -q '"id"'; then
  say "✅ Workspace ready — the app will start straight into the main window"
else
  say "⚠️  Bootstrap did not finish — the app will pick up where this left off."
fi

# Leave the service running when we started it: the app's startup adopts a
# healthy service and skips its own install/bootstrap path entirely.
[ "$STARTED_HERE" = "1" ] && say "ℹ️  SLP left running for the app to adopt (stop it with: $SLP_BIN agent stop)"
exit 0
