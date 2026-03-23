const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * afterPack hook for electron-builder.
 *
 * Signs the SLP PEX binary with the same Developer ID identity,
 * entitlements, hardened runtime, and secure timestamp as the main app
 * so that Apple notarization accepts it.
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

  // Resolve the Developer ID signing identity from the keychain
  const identities = execSync(
    'security find-identity -v -p codesigning | grep "Developer ID Application"',
    { encoding: 'utf8' }
  ).trim();

  const hashMatch = identities.match(/([A-F0-9]{40})/);
  if (!hashMatch) {
    throw new Error('[afterPack] No Developer ID Application identity found in keychain');
  }
  const identityHash = hashMatch[1];

  console.log('[afterPack] Signing SLP binary with identity:', identityHash);
  execSync(
    `codesign --sign ${identityHash} --force --timestamp --options runtime --entitlements "${entitlements}" "${slpBinary}"`,
    { stdio: 'inherit' }
  );
  console.log('[afterPack] SLP binary signed successfully');
};
