const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'slp-binary.json'), 'utf-8')
);

function getPlatformKey() {
  switch (process.platform) {
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'darwin';
    case 'win32':
      return 'win';
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

async function main() {
  const platform = getPlatformKey();
  const { version, baseUrl, binaries } = config;
  const expectedHash = binaries[platform]?.sha256;

  if (!expectedHash) {
    throw new Error(`No binary config for platform: ${platform}`);
  }

  const outputDir = path.join(__dirname, '..', 'build', 'slp');
  const hashMarker = path.join(outputDir, '.sha256');

  // Skip download if binary already exists with correct hash
  if (fs.existsSync(hashMarker)) {
    const currentHash = fs.readFileSync(hashMarker, 'utf-8').trim();
    if (currentHash === expectedHash) {
      console.log(`slp binary already up-to-date (${version})`);
      return;
    }
    console.log('Version changed, re-downloading...');
  }

  const url = `${baseUrl}/${version}/${platform}/slp.zip`;
  const zipPath = path.join(__dirname, '..', 'build', 'slp.zip');

  // Ensure build directory exists
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });

  console.log(`Downloading slp ${version} for ${platform}...`);
  console.log(`URL: ${url}`);
  execSync(`curl -fL --progress-bar -o "${zipPath}" "${url}"`, { stdio: 'inherit' });

  // Verify hash
  const hashOutput = execSync(`sha256sum "${zipPath}"`).toString().trim();
  const actualHash = hashOutput.split(/\s+/)[0];
  if (actualHash !== expectedHash) {
    fs.unlinkSync(zipPath);
    throw new Error(
      `SHA-256 hash mismatch!\n  Expected: ${expectedHash}\n  Actual:   ${actualHash}`
    );
  }
  console.log('SHA-256 hash verified.');

  // Clean and extract
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  if (platform === 'win') {
    execSync(
      `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outputDir}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${outputDir}"`, { stdio: 'inherit' });
  }

  // Make binary executable on Unix
  const binaryName = platform === 'win' ? 'slp.exe' : 'slp';
  const binaryPath = path.join(outputDir, 'slp', binaryName);
  if (platform !== 'win' && fs.existsSync(binaryPath)) {
    fs.chmodSync(binaryPath, 0o755);
  }

  // Write hash marker for cache check
  fs.writeFileSync(hashMarker, expectedHash);

  // Clean up zip
  fs.unlinkSync(zipPath);

  console.log(`slp ${version} installed to ${outputDir}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
