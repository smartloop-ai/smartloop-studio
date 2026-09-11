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
 *     fetched from dl.smartloop.ai on first launch. Every other packaged build
 *     now ships it the same way, and all of them run it in place from the
 *     bundle rather than copying it out.
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

/**
 * The bootstrap model shipped inside the app, mirroring the SLP framework.
 *
 * It is one file — smartloop-ai/slp-orchestra-mini/<name>.gguf, ~770 MB — laid
 * out under the resources dir exactly as it sits in a workspace's models/
 * directory, so seeding is a copy of a path rather than a transformation of one.
 */
function bundledModelsDir() {
  const packaged = path.join(process.resourcesPath || '', 'models');
  if (fs.existsSync(packaged)) return packaged;
  // Dev: process.resourcesPath points at Electron's own Resources, which has no
  // bundled model. Fall back to the repo's staged copy (see `make stage-model`).
  return path.join(__dirname, '..', 'build', 'models');
}

/** The first .gguf under the bundled models dir, or null when none shipped. */
function bundledModelFile() {
  const root = bundledModelsDir();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith('.gguf')) {
        // Relative path is what makes the destination inside the workspace.
        return { path: full, relative: path.relative(root, full) };
      }
    }
  }
  return null;
}

/** True when the bootstrap model actually ships inside this build. */
function hasBundledModel() {
  const found = bundledModelFile();
  if (!found) return false;
  try {
    return fs.statSync(found.path).size > 0;
  } catch {
    return false;
  }
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
 * True when SLP ships inside the app and is therefore run IN PLACE from the
 * bundle — never copied to the install dir, never downloaded at runtime. Every
 * packaged platform bundles it (macOS dmg + MAS, Windows, Linux), so this is
 * true whenever a bundled SLP is present; a sandboxed build always is. False
 * only for a build with no bundled framework (a source checkout, or a package
 * whose extraResources went missing), which falls back to the CDN download.
 * SMARTLOOP_BUNDLED_SLP=1 forces it.
 */
function useBundledSlp() {
  if (process.env.SMARTLOOP_BUNDLED_SLP === '1') return true;
  return isSandboxed() || hasBundledSlp();
}

module.exports = {
  bundledModelsDir,
  bundledModelFile,
  hasBundledModel,
  isMasBuild,
  isSandboxed,
  bundledSlpDir,
  bundledSlpBinaryPath,
  hasBundledSlp,
  useBundledSlp,
};
