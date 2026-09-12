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
 * The models shipped inside the app, laid out exactly as a workspace lays them
 * out under its own models/ directory:
 *
 *   smartloop-ai/slp-orchestra-mini/<name>.gguf   ~770 MB  the chat model
 *   embeddings/bge-m3-Q4_K_M.gguf                 ~418 MB  document search
 *
 * Both are copied into the workspace once it exists (see ensureBootstrapModel
 * in main.js). Mirroring the layout here is what makes that a copy of a
 * relative path rather than a mapping table: SLP resolves the chat weights at
 * <workspace>/models/<model_id>/ and the embedding GGUF at
 * <workspace>/models/embeddings/<file>, and neither needs to know the app put
 * them there.
 */
function bundledModelsDir() {
  const packaged = path.join(process.resourcesPath || '', 'models');
  if (fs.existsSync(packaged)) return packaged;
  // Dev: process.resourcesPath points at Electron's own Resources, which has no
  // bundled model. Fall back to the repo's staged copy (see `make stage-model`).
  return path.join(__dirname, '..', 'build', 'models');
}

/** Directory name holding the embedding GGUF, in the bundle and the workspace. */
const EMBEDDINGS_SUBDIR = 'embeddings';

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
        const relative = path.relative(root, full);
        found.push({
          path: full,
          relative,
          isEmbedding: relative.split(path.sep)[0] === EMBEDDINGS_SUBDIR,
        });
      }
    }
  }
  return found;
}

/** The chat model shipped inside the app, or null when none shipped. */
function bundledModelFile() {
  return bundledModelFiles().find((file) => !file.isEmbedding) || null;
}

/**
 * True when the chat model actually ships inside this build — which is what
 * decides whether there is a first-run download to ask consent for. The
 * embedding model alone does not count: it only matters once someone indexes a
 * document, and SLP falls back to TF-IDF without it.
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
  bundledSlpDir,
  bundledSlpBinaryPath,
  hasBundledSlp,
  useBundledSlp,
};
