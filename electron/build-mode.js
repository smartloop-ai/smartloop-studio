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
 *   - SLP state (server.port, server.log, config, models, studio.db, assets)
 *     lives in ~/.smartloop, except where confinement forbids it: the
 *     sandboxed MAS build keeps it in its container (App Review rejects the
 *     home-relative-path exception that reaching ~/.smartloop would need), and
 *     the snap, whose strict confinement blocks ~/.*, keeps it in
 *     $SNAP_USER_COMMON (see slpHomeDir).
 *   - The store delivers updates, so the app reports none of its own.
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
const os = require('os');

/** True in an actual Mac App Store build. */
function isMasBuild() {
  return process.mas === true;
}

/**
 * True when the app runs under the App Sandbox: bind the local server to
 * loopback, don't install the CLI, and leave updates to the store. Only the MAS
 * build. SMARTLOOP_FORCE_SANDBOX=1 forces it for local testing of the
 * sandboxed code paths.
 */
function isSandboxed() {
  if (process.env.SMARTLOOP_FORCE_SANDBOX === '1') return true;
  return isMasBuild();
}

/**
 * The user's real home directory. Under the App Sandbox os.homedir() / $HOME is
 * the app's container (~/Library/Containers/<bundle id>/Data), so read the home
 * from the passwd database instead, which the sandbox doesn't redirect. Same
 * value as os.homedir() everywhere else.
 */
function realHomeDir() {
  try {
    const home = os.userInfo().homedir;
    if (home) return home;
  } catch {}
  return os.homedir();
}

/**
 * SLP's home (SLP_HOME): ~/.smartloop under the real home, except in two
 * confined builds that can't reach it:
 *   - The sandboxed MAS build keeps it in its container (userData/slp). App
 *     Review refuses the temporary-exception.files.home-relative-path
 *     entitlement for /.smartloop/, so the store build does not share state
 *     with the CLI or the Developer-ID build.
 *   - The snap: strict confinement's `home` plug denies top-level dotfiles
 *     (~/.*), so SQLite fails with "unable to open database file" there. It
 *     uses $SNAP_USER_COMMON (~/snap/smartloop-studio/common) instead, which
 *     survives revision updates.
 */
function slpHomeDir() {
  if (process.env.SNAP && process.env.SNAP_USER_COMMON) {
    return process.env.SNAP_USER_COMMON;
  }
  if (isSandboxed()) {
    return path.join(require('electron').app.getPath('userData'), 'slp');
  }
  return path.join(realHomeDir(), '.smartloop');
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
 * The models shipped inside the app, laid out exactly as a workspace lays them
 * out under its own models/ directory:
 *
 *   smartloop-ai/slp-orchestra-mini/<name>.gguf   ~770 MB  the chat model
 *
 * Copied into the workspace once it exists (see ensureBootstrapModel in
 * main.js). Mirroring the layout here is what makes that a copy of a relative
 * path rather than a mapping table: SLP resolves the weights at
 * <workspace>/models/<model_id>/ and needs no notion of the app putting them
 * there. The embedding model is not here: the SLP framework ships it next to
 * its binary on every platform.
 */
function bundledModelsDir() {
  const packaged = path.join(process.resourcesPath || '', 'models');
  if (fs.existsSync(packaged)) return packaged;
  // Dev: process.resourcesPath points at Electron's own Resources, which has no
  // bundled model. Fall back to the repo's staged copy (see `make stage-model`).
  return path.join(__dirname, '..', 'build', 'models');
}

/**
 * Every .gguf that ships in this build, with the path each one keeps relative
 * to the models root — that relative path is the destination inside the
 * workspace.
 */
function bundledModelFiles() {
  const root = bundledModelsDir();
  const found = [];
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
        found.push({ path: full, relative: path.relative(root, full) });
      }
    }
  }
  return found;
}

/** The chat model shipped inside the app, or null when none shipped. */
function bundledModelFile() {
  return bundledModelFiles()[0] || null;
}

/**
 * True when the chat model actually ships inside this build — which is what
 * decides whether there is a first-run download to ask consent for.
 */
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
  bundledModelFiles,
  hasBundledModel,
  isMasBuild,
  isSandboxed,
  realHomeDir,
  slpHomeDir,
  bundledSlpDir,
  bundledSlpBinaryPath,
  hasBundledSlp,
  useBundledSlp,
};
