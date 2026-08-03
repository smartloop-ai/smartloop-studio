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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

exports.default = async function sign(configuration) {
  // Signing is CI-only — local builds always stay unsigned, even if AZURE_TS_*
  // vars happen to be present in the developer's shell.
  if (process.env.CI !== 'true' && process.env.GITHUB_ACTIONS !== 'true') {
    console.log(`  • not running in CI — skipping Authenticode signing  file=${configuration.path}`);
    return;
  }

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

  // The dlib resolves an AAD token via Azure.Identity's DefaultAzureCredential,
  // which walks a fixed chain. azure/login (OIDC) establishes an Azure CLI
  // session but sets no client secret or federated-token file, so the only
  // credential that can actually mint a token is AzureCliCredential — which
  // sits *after* ManagedIdentityCredential in the chain. On GitHub-hosted
  // runners there is no managed identity, and the ManagedIdentity IMDS probe
  // (169.254.169.254) intermittently blackholes and hangs, stalling signtool
  // at "Submitting digest for signing..." until the timeout killed the build.
  // Exclude ManagedIdentity (the hang) plus the desktop/interactive
  // credentials that have no business on a runner, so the chain resolves
  // straight to the Azure CLI session azure/login created.
  const excludeCredentials = [
    '-ExcludeManagedIdentityCredential',
    '-ExcludeSharedTokenCacheCredential',
    '-ExcludeVisualStudioCredential',
    '-ExcludeVisualStudioCodeCredential',
    '-ExcludeInteractiveBrowserCredential',
  ];

  // With the IMDS hang removed, genuine Trusted Signing calls complete in
  // seconds, so a tight per-attempt timeout is safe and turns a stalled
  // request into a fast retry instead of a 20-minute build failure.
  const perAttemptTimeoutSec = 300;
  const maxAttempts = 3;

  const command = [
    importModule + ';',
    'Invoke-TrustedSigning',
    '-Endpoint', psQuote(endpoint),
    '-CodeSigningAccountName', psQuote(account),
    '-CertificateProfileName', psQuote(profile),
    '-FileDigest', psQuote('SHA256'),
    '-TimestampRfc3161', psQuote('http://timestamp.acs.microsoft.com'),
    '-TimestampDigest', psQuote('SHA256'),
    ...excludeCredentials,
    '-Timeout', String(perAttemptTimeoutSec),
    '-Files', psQuote(configuration.path),
  ].join(' ');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `  • signing with Azure Trusted Signing (attempt ${attempt}/${maxAttempts})  file=${configuration.path}`
      );
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { stdio: 'inherit' }
      );
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(`  ⨯ signing failed after ${maxAttempts} attempts  file=${configuration.path}`);
        throw err;
      }
      const backoffSec = attempt * 15;
      const reason = (err && err.message ? String(err.message).split('\n')[0] : String(err));
      console.warn(`  • signing attempt ${attempt} failed (${reason}); retrying in ${backoffSec}s`);
      await sleep(backoffSec * 1000);
    }
  }
};
