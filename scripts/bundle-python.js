/**
 * bundle-python.js
 *
 * Downloads python-build-standalone for the target platform/arch,
 * codesigns it on macOS (Developer ID when available, ad-hoc otherwise),
 * and places it in build/resources/ so electron-builder can include it
 * as an extraResource.
 *
 * Usage:
 *   node scripts/bundle-python.js [--arch arm64|x64] [--platform darwin|linux]
 *
 * Defaults to the current platform and arch.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');

const PYTHON_VERSION = '3.11.15';
const PYTHON_RELEASE = '20260320';

const OUTPUT_DIR = path.join(__dirname, '..', 'build', 'resources');

// ── Parse CLI args ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let arch = os.arch();        // 'arm64' or 'x64'
  let platform = process.platform; // 'darwin' or 'linux'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--arch' && args[i + 1]) {
      arch = args[++i];
    } else if (args[i] === '--platform' && args[i + 1]) {
      platform = args[++i];
    }
  }

  // Normalise arch names to python-build-standalone naming
  const pbsArch = arch === 'arm64' ? 'aarch64' : 'x86_64';

  return { arch, pbsArch, platform };
}

// ── Download helper ─────────────────────────────────────────────────────────

function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    function doRequest(currentUrl, redirectsLeft) {
      const mod = currentUrl.startsWith('https') ? https : require('http');
      mod.get(currentUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          if (redirectsLeft <= 0) {
            file.close();
            try { fs.unlinkSync(destPath); } catch {}
            reject(new Error('Too many redirects'));
            return;
          }
          doRequest(response.headers.location, redirectsLeft - 1);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(destPath); } catch {}
          reject(new Error(`Download failed with HTTP ${response.statusCode} for ${currentUrl}`));
          return;
        }

        const total = parseInt(response.headers['content-length'], 10) || 0;
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            process.stdout.write(`\r  Downloading… ${pct}% (${(downloaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB)`);
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            process.stdout.write('\n');
            resolve();
          });
        });
        file.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      });
    }

    doRequest(url, maxRedirects);
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { arch, pbsArch, platform } = parseArgs();

  console.log(`Bundling Python ${PYTHON_VERSION} for ${platform}/${arch} (${pbsArch})`);

  // Build the download URL
  let filename;
  if (platform === 'darwin') {
    filename = `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${pbsArch}-apple-darwin-install_only.tar.gz`;
  } else {
    filename = `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${pbsArch}-unknown-linux-gnu-install_only.tar.gz`;
  }
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${filename}`;

  // Download to a temp location
  const tmpTar = path.join(os.tmpdir(), `python-bundle-${platform}-${arch}.tar.gz`);
  console.log(`Downloading from:\n  ${url}`);
  await downloadFile(url, tmpTar);

  // On macOS: extract, codesign, then re-tar
  if (platform === 'darwin') {
    const extractDir = path.join(os.tmpdir(), `python-bundle-extract-${arch}`);

    // Clean previous extract
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    console.log('Extracting for codesigning…');
    execSync(`tar -xzf "${tmpTar}" -C "${extractDir}"`, { stdio: 'pipe' });

    const pythonRoot = path.join(extractDir, 'python');
    if (!fs.existsSync(pythonRoot)) {
      throw new Error(`Expected 'python/' directory inside tarball, not found at ${pythonRoot}`);
    }

    // Determine signing identity: use Developer ID if available (CI), else ad-hoc
    const entitlements = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');
    let useDevId = false;
    let signIdentity = '-';
    let signFlags = '--force --sign -';

    try {
      const result = execSync(
        'security find-identity -v -p codesigning | grep "Developer ID Application"',
        { stdio: 'pipe', encoding: 'utf8' }
      );
      if (result.trim()) {
        useDevId = true;
        signIdentity = 'Developer ID Application';
        signFlags = `--force --timestamp --options runtime --entitlements "${entitlements}" --sign "${signIdentity}"`;
        console.log('Found Developer ID certificate — signing for notarization');
      }
    } catch {
      console.log('No Developer ID certificate found — using ad-hoc signing');
    }

    // Codesign all Mach-O binaries and .so/.dylib files
    console.log(`Codesigning all binaries and shared libraries (identity: ${signIdentity})…`);
    // Sign .so and .dylib files first (leaves, before the main binaries that load them)
    execSync(
      `find "${pythonRoot}" -type f \\( -name "*.so" -o -name "*.dylib" \\) -exec codesign ${signFlags} {} +`,
      { stdio: 'inherit' }
    );
    // Sign executable binaries
    execSync(
      `find "${pythonRoot}/bin" -type f -perm +111 -exec codesign ${signFlags} {} +`,
      { stdio: 'inherit' }
    );

    console.log('Verifying codesign on python3…');
    execSync(`codesign --verify --verbose "${pythonRoot}/bin/python3"`, { stdio: 'inherit' });

    // Re-tar the signed tree
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const outFile = path.join(OUTPUT_DIR, `python-${arch}.tar.gz`);
    console.log(`Re-packing signed Python to ${outFile}`);
    execSync(`tar -czf "${outFile}" -C "${extractDir}" python`, { stdio: 'pipe' });

    // Cleanup
    fs.rmSync(extractDir, { recursive: true, force: true });
    try { fs.unlinkSync(tmpTar); } catch {}

    console.log(`Done: ${outFile}`);
  } else {
    // Linux: just copy the tarball as-is (no codesign needed)
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const outFile = path.join(OUTPUT_DIR, `python-${arch}.tar.gz`);
    fs.copyFileSync(tmpTar, outFile);
    try { fs.unlinkSync(tmpTar); } catch {}
    console.log(`Done: ${outFile}`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
