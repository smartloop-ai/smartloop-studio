/**
 * electron-builder custom Windows sign hook — Azure Trusted Signing.
 *
 * Signs with the same Trusted Signing account/certificate profile that
 * smartloop-ai/smartloop uses for slp.exe. Authentication comes from the
 * ambient Azure credential (azure/login OIDC in CI — no client secret, which
 * is why this hook exists instead of electron-builder's built-in
 * azureSignOptions, that path requires AZURE_CLIENT_SECRET). The signing
 * endpoint/account/profile come from the AZURE_TS_* env vars; when they are
 * not set (local builds) signing is skipped so the build still succeeds.
 *
 * Requires the TrustedSigning PowerShell module (installed by the CI
 * workflow before the build step).
 */
const { execFileSync } = require('child_process');

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

exports.default = async function sign(configuration) {
  const endpoint = process.env.AZURE_TS_ENDPOINT;
  const account = process.env.AZURE_TS_ACCOUNT;
  const profile = process.env.AZURE_TS_PROFILE;

  if (!endpoint || !account || !profile) {
    console.log(`  • AZURE_TS_* env vars not set — skipping Authenticode signing  file=${configuration.path}`);
    return;
  }

  // Trusted Signing certificates are SHA256-only; electron-builder may invoke
  // the hook once per hash algorithm, so ignore the legacy sha1 pass.
  if (configuration.hash && configuration.hash.toLowerCase() === 'sha1') {
    return;
  }

  // CI runners preset the PSModulePath env var with PowerShell 7 paths, which
  // hides modules installed for Windows PowerShell 5.1 (CurrentUser scope) —
  // import explicitly, falling back to the 5.1 user module directory.
  const importModule =
    "if (-not (Get-Command Invoke-TrustedSigning -ErrorAction SilentlyContinue)) { " +
    "Import-Module TrustedSigning -ErrorAction SilentlyContinue; " +
    "if (-not (Get-Command Invoke-TrustedSigning -ErrorAction SilentlyContinue)) { " +
    "Import-Module (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'WindowsPowerShell\\Modules\\TrustedSigning') -ErrorAction Stop } }";

  const command = [
    importModule + ';',
    'Invoke-TrustedSigning',
    '-Endpoint', psQuote(endpoint),
    '-CodeSigningAccountName', psQuote(account),
    '-CertificateProfileName', psQuote(profile),
    '-FileDigest', psQuote('SHA256'),
    '-TimestampRfc3161', psQuote('http://timestamp.acs.microsoft.com'),
    '-TimestampDigest', psQuote('SHA256'),
    // The module's default signtool timeout is 300s; the Trusted Signing
    // endpoint sometimes takes longer to return a signature, which killed
    // otherwise-healthy builds. Give it real headroom.
    '-Timeout', '1200',
    '-Files', psQuote(configuration.path),
  ].join(' ');

  console.log(`  • signing with Azure Trusted Signing  file=${configuration.path}`);
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { stdio: 'inherit' }
  );
};
