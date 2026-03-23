const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * afterPack hook for electron-builder.
 *
 * The PEX/SCIE binary has appended data that breaks macOS strict codesign
 * validation, so electron-builder skips it via signIgnore. We sign it here
 * with the real Developer ID identity, hardened runtime, and a secure
 * timestamp so that Apple notarization accepts it.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  const slpBinary = path.join(appPath, 'Contents', 'Resources', 'slp', 'slp', 'slp');
  const entitlements = path.join(context.packager.info.projectDir, 'build', 'entitlements.mac.plist');

  if (!fs.existsSync(slpBinary)) {
    console.log('[afterPack] SLP binary not found, skipping');
    return;
  }

  // Use the same signing identity that electron-builder uses.
  // CSC_NAME or the identity from the keychain imported in CI.
  const identity = process.env.CSC_NAME || 'Developer ID Application';

  console.log('[afterPack] Signing SLP PEX binary with identity:', identity);
  try {
    execSync(
      `codesign --sign "${identity}" --force --timestamp --options runtime --entitlements "${entitlements}" "${slpBinary}"`,
      { stdio: 'inherit' }
    );
    console.log('[afterPack] SLP binary signed successfully');
  } catch (error) {
    console.error('[afterPack] Codesign failed:', error.message);
    throw error;
  }
};
