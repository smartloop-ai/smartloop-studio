const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * afterPack hook for electron-builder.
 *
 * The PEX/SCIE binary has appended data that breaks macOS strict codesign.
 * electron-builder skips it via signIgnore, so we sign it here with the
 * same entitlements as the Electron app (ad-hoc, no strict validation).
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

  console.log('[afterPack] Signing SLP PEX binary with app entitlements...');
  try {
    execSync(
      `codesign --sign - --force --entitlements "${entitlements}" "${slpBinary}"`,
      { stdio: 'inherit' }
    );
    console.log('[afterPack] SLP binary signed successfully');
  } catch (error) {
    console.error('[afterPack] Codesign failed:', error.message);
  }
};
