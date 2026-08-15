/**
 * build-mode.js
 *
 * Centralizes how the app distinguishes a Mac App Store (MAS) / bundled build
 * from the normal Developer-ID direct-download build.
 *
 * Why this matters:
 *   - MAS builds run under the App Sandbox. They may NOT download and execute
 *     native code at runtime (App Review guideline 2.5.2), so the SLP framework
 *     must ship INSIDE the .app (Contents/Resources/slp) instead of being
 *     fetched from dl.smartloop.ai on first launch.
 *   - Sandboxed apps may only write inside their container, so SLP state
 *     (server.port, server.log, config, models, studio.db, assets) must live
 *     under app.getPath('userData'), not ~/.smartloop.
 *   - The store delivers updates, so electron-updater is disabled.
 *   - The sandbox cannot write to ~/.local/bin, so the `slp` CLI symlink is
 *     unavailable.
 *
 * Detection:
 *   - Electron sets `process.mas === true` in a Mac App Store build.
 *   - SMARTLOOP_BUNDLED_SLP=1 forces bundled behavior for local testing of a
 *     MAS-style build without going through App Store signing.
 */

const path = require('path');
const fs = require('fs');

/** True in an actual Mac App Store build. */
function isMasBuild() {
  return process.mas === true;
}

/**
 * True when the app runs under the App Sandbox and must keep all writable
 * state inside its container (userData), bind the local server to loopback,
 * and leave updates to the store. Only the MAS build. SMARTLOOP_FORCE_SANDBOX=1
 * forces it for local testing of the sandboxed data layout.
 */
function isSandboxed() {
  if (process.env.SMARTLOOP_FORCE_SANDBOX === '1') return true;
  return isMasBuild();
}

/** Directory where a bundled SLP framework lives inside the packaged app. */
function bundledSlpDir() {
  // Packaged builds: extraResources (electron-builder.yml) copies build/slp →
  // <app>/Contents/Resources/slp.
  const packaged = path.join(process.resourcesPath || '', 'slp');
  if (fs.existsSync(packaged)) return packaged;
  // Dev (`make electron-dev`): process.resourcesPath points at Electron's own
  // Resources dir, which has no bundled SLP. Fall back to the repo's staged
  // build/slp/ so `SMARTLOOP_FORCE_SANDBOX=1` dev runs can exercise the
  // run-in-place path (requires `make stage-slp` to have populated build/slp/).
  return path.join(__dirname, '..', 'build', 'slp');
}

/** The bundled SLP binary path (slp.exe on Windows, slp elsewhere). */
function bundledSlpBinaryPath() {
  const name = process.platform === 'win32' ? 'slp.exe' : 'slp';
  return path.join(bundledSlpDir(), name);
}

/** True when a bundled SLP binary is actually present on disk. */
function hasBundledSlp() {
  try {
    return fs.statSync(bundledSlpBinaryPath()).size > 0;
  } catch {
    return false;
  }
}

/**
 * True when SLP is shipped inside the app and should be copied to the install
 * dir instead of downloaded at runtime. On macOS the framework is bundled for
 * BOTH the direct-download (dmg) and MAS builds — the size is acceptable and it
 * removes the first-launch download — so this is true whenever a bundled SLP is
 * present. Windows/Linux keep the runtime download (no bundled SLP present).
 * A sandboxed build is always bundled. SMARTLOOP_BUNDLED_SLP=1 forces it.
 */
function useBundledSlp() {
  if (process.env.SMARTLOOP_BUNDLED_SLP === '1') return true;
  return isSandboxed() || hasBundledSlp();
}

module.exports = {
  isMasBuild,
  isSandboxed,
  bundledSlpDir,
  bundledSlpBinaryPath,
  hasBundledSlp,
  useBundledSlp,
};
