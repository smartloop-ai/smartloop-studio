#!/usr/bin/env bash
#
# Build native/ against Electron's headers.
#
# `electron-builder install-app-deps` rebuilds native modules it finds in
# node_modules, but this one is a `file:` dependency symlinked back into the
# repo, and it walks past it. Left to npm the addon gets built for the system
# Node ABI instead, which then fails to load in Electron with a confusing
# NODE_MODULE_VERSION mismatch. So build it explicitly.
#
# Non-macOS is a no-op: binding.gyp compiles the unsupported stub there, and the
# app never calls into it.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "$(uname -s)" != "Darwin" ]; then
  echo "ℹ️  Native auth is macOS-only — skipping rebuild on $(uname -s)."
  exit 0
fi

ELECTRON_VERSION="$(node -p "require('electron/package.json').version")"
ARCH="${NATIVE_ARCH:-$(node -p "process.arch")}"

echo "🔨 Building native auth addon for Electron ${ELECTRON_VERSION} (${ARCH})..."
(
  cd native
  npx --no-install node-gyp rebuild \
    --target="${ELECTRON_VERSION}" \
    --arch="${ARCH}" \
    --dist-url=https://electronjs.org/headers
) >/dev/null 2>&1 || {
  echo "⚠️  Native auth addon failed to build — sign-in will fall back and report it."
  exit 0
}

echo "✅ Built native/build/Release/smartloop_auth.node (${ARCH})"
