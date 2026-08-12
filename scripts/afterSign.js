/**
 * afterSign.js
 *
 * electron-builder afterSign hook.
 * Runs after the main .app is signed but before notarization.
 *
 * Responsibilities:
 *   1. Extract python.tar.gz from the signed app bundle's Resources/
 *   2. Re-sign all Mach-O binaries (executables, .so, .dylib) with the
 *      Developer ID certificate + hardened runtime + entitlements
 *   3. Re-pack the tar.gz back in place
 *   4. Re-sign the entire .app so the modified resource is covered
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

exports.default = async function afterSign(context) {
  // Only needed on macOS
  if (context.electronPlatformName !== 'darwin') return;

  // Skip for Mac App Store builds: MAS signs with the Apple Distribution
  // identity + embedded provisioning profile (handled by electron-builder's
  // mas signer), not Developer ID, and is never notarized here. Re-signing the
  // Python bundle with Developer ID would break the store signature.
  if (process.env.MAS_BUILD) {
    console.log('[afterSign] MAS_BUILD set — skipping Developer ID Python re-sign.');
    return;
  }

  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');
  const pythonTar = path.join(resourcesPath, 'python.tar.gz');

  if (!fs.existsSync(pythonTar)) {
    console.log('[afterSign] python.tar.gz not found, skipping Python re-sign.');
    return;
  }

  // Resolve signing identity — prefer CSC_NAME env var, fall back to any
  // Developer ID Application cert in the keychain.
  const identity = process.env.CSC_NAME
    || process.env.APPLE_SIGNING_IDENTITY
    || 'Developer ID Application';

  const entitlements = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');

  console.log(`[afterSign] Re-signing Python bundle with identity: "${identity}"`);

  // Extract to a temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'python-aftersign-'));
  try {
    console.log('[afterSign] Extracting python.tar.gz…');
    execSync(`tar -xzf "${pythonTar}" -C "${tmpDir}"`, { stdio: 'pipe' });

    const pythonRoot = path.join(tmpDir, 'python');
    if (!fs.existsSync(pythonRoot)) {
      throw new Error(`[afterSign] Expected 'python/' inside tar, not found at ${pythonRoot}`);
    }

    const signArgs = [
      '--force',
      '--timestamp',
      '--options runtime',
      `--entitlements "${entitlements}"`,
      `--sign "${identity}"`,
    ].join(' ');

    // Sign .so and .dylib (leaves first)
    console.log('[afterSign] Signing .so / .dylib files…');
    execSync(
      `find "${pythonRoot}" -type f \\( -name "*.so" -o -name "*.dylib" \\) -print0 | xargs -0 -I{} codesign ${signArgs} "{}"`,
      { stdio: 'inherit' }
    );

    // Sign executable binaries in bin/
    console.log('[afterSign] Signing executables in bin/…');
    execSync(
      `find "${pythonRoot}/bin" -type f -perm +111 -print0 | xargs -0 -I{} codesign ${signArgs} "{}"`,
      { stdio: 'inherit' }
    );

    // Quick verify
    const python3 = path.join(pythonRoot, 'bin', 'python3');
    if (fs.existsSync(python3)) {
      console.log('[afterSign] Verifying python3 signature…');
      execSync(`codesign --verify --verbose "${python3}"`, { stdio: 'inherit' });
    }

    // Re-pack signed tree back into the app bundle
    console.log('[afterSign] Re-packing signed Python into app bundle…');
    execSync(`tar -czf "${pythonTar}" -C "${tmpDir}" python`, { stdio: 'pipe' });

    // Re-sign the app bundle so the modified resource is covered by the signature
    console.log('[afterSign] Re-signing .app bundle…');
    execSync(
      `codesign --force --deep --timestamp --options runtime --entitlements "${entitlements}" --sign "${identity}" "${appPath}"`,
      { stdio: 'inherit' }
    );

    console.log('[afterSign] Done. Python binaries signed and app re-signed.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};
