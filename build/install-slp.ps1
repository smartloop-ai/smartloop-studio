# Installs the SLP framework during Smartloop Studio setup (Windows).
#
# PowerShell port of installService() in electron/slp-setup.js: download
# windows-amd64-slp.zip from dl.smartloop.ai, extract it to
# %USERPROFILE%\.smartloop\<version>\, verify the binary, and write the same
# tracking files the app checks at startup (.installed-version, .binary-hash,
# .archive-etag, version, installed) so first launch skips the in-app
# download. Any failure here is non-fatal — the installer just logs it and the
# app's runtime installer (slp-setup.js) takes over on first launch.
#
# $VERSION must match VERSION in electron/slp-setup.js — release-prod.yml
# bumps both together.
$VERSION = '1.0.3'

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$baseUrl = 'https://dl.smartloop.ai'
if ($env:SLP_BASE_URL) { $baseUrl = $env:SLP_BASE_URL.TrimEnd('/') }

$installDir  = Join-Path $env:USERPROFILE '.smartloop'
$versionDir  = Join-Path $installDir $VERSION
$cacheDir    = Join-Path $installDir 'cache'
$markerFile  = Join-Path $installDir '.installed-version'
$hashFile    = Join-Path $installDir '.binary-hash'
$etagFile    = Join-Path $installDir '.archive-etag'
$archiveUrl  = "$baseUrl/slp/$VERSION/windows-amd64-slp.zip"
$archivePath = Join-Path $cacheDir "slp-$VERSION-windows-amd64.zip"

# node's fs.writeFileSync writes plain UTF-8. Out-File in Windows PowerShell
# prepends a BOM that the app would read back as part of the value (breaking
# the hash/version comparisons), so every tracking file goes through
# WriteAllText, which is BOM-less by default.
function Write-TrackingFile([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content)
}

# Mirrors semverGte() in slp-setup.js: true when $a >= $b.
function Test-SemverGte([string]$a, [string]$b) {
    $pa = $a.Split('.'); $pb = $b.Split('.')
    for ($i = 0; $i -lt 3; $i++) {
        $va = 0; $vb = 0
        if ($i -lt $pa.Length) { [int]::TryParse($pa[$i], [ref]$va) | Out-Null }
        if ($i -lt $pb.Length) { [int]::TryParse($pb[$i], [ref]$vb) | Out-Null }
        if ($va -gt $vb) { return $true }
        if ($va -lt $vb) { return $false }
    }
    return $true
}

# Streamed download with percentage lines (surfaced in the installer's details
# pane via nsExec::ExecToLog). Returns the response ETag so it can be stored
# the way storeRemoteEtag() does — the app compares it on later launches to
# decide whether the remote archive changed.
function Get-SlpArchive([string]$Url, [string]$Dest) {
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.AllowAutoRedirect = $true
    $request.Timeout = 30000
    $response = $request.GetResponse()
    try {
        $etag = $response.Headers['ETag']
        $total = $response.ContentLength
        $inStream = $response.GetResponseStream()
        $outStream = [System.IO.File]::Create($Dest)
        try {
            $buffer = New-Object byte[] 1048576
            $downloaded = 0
            $lastPct = -1
            while (($read = $inStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $outStream.Write($buffer, 0, $read)
                $downloaded += $read
                if ($total -gt 0) {
                    $pct = [int](($downloaded * 100) / $total)
                    if ($pct -ge ($lastPct + 5)) {
                        $lastPct = $pct
                        Write-Output "Downloading SLP framework... $pct%"
                    }
                }
            }
        }
        finally {
            $outStream.Dispose()
            $inStream.Dispose()
        }
        return $etag
    }
    finally {
        $response.Close()
    }
}

try {
    # Already installed at (or past) this version with a usable binary?
    # Mirrors needsInstall() — skip everything so reinstalls/upgrades of the
    # app don't re-download a framework that is already in place.
    if (Test-Path $markerFile) {
        $installed = ([System.IO.File]::ReadAllText($markerFile)).Trim()
        if ($installed -and (Test-SemverGte $installed $VERSION)) {
            $installedBinary = Join-Path (Join-Path $installDir $installed) 'slp.exe'
            if ((Test-Path $installedBinary) -and ((Get-Item $installedBinary).Length -gt 0)) {
                Write-Output "SLP $installed already installed - skipping framework download."
                exit 0
            }
        }
    }

    New-Item -ItemType Directory -Force -Path $installDir, $cacheDir, $versionDir | Out-Null

    Write-Output "Downloading SLP framework $VERSION from $archiveUrl"
    $etag = Get-SlpArchive $archiveUrl $archivePath
    if ($etag) { Write-TrackingFile $etagFile ($etag -replace '"', '') }

    # Clean the version dir, then extract. Like slp-setup.js, strip a
    # top-level slp/ wrapper so the binary lands at <versionDir>\slp.exe.
    Get-ChildItem -Path $versionDir -Force | Remove-Item -Recurse -Force

    Write-Output 'Extracting SLP framework...'
    $entries = & tar -tf $archivePath
    if ($LASTEXITCODE -ne 0) { throw 'tar could not list the downloaded archive' }
    $topLevel = @($entries | ForEach-Object { ($_ -split '/')[0] } | Sort-Object -Unique)
    $tarArgs = @('-xf', $archivePath, '-C', $versionDir)
    if ($topLevel.Count -eq 1 -and $topLevel[0] -eq 'slp') { $tarArgs += '--strip-components=1' }
    & tar @tarArgs
    if ($LASTEXITCODE -ne 0) { throw "tar extraction failed with exit code $LASTEXITCODE" }

    $binary = Join-Path $versionDir 'slp.exe'
    if (-not (Test-Path $binary) -or ((Get-Item $binary).Length -eq 0)) {
        throw "slp.exe missing or empty at $binary after extraction"
    }

    Write-Output 'Verifying SLP binary...'
    & $binary --version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "'slp --version' exited with code $LASTEXITCODE" }

    Write-Output 'Configuring...'
    $binaryHash = (Get-FileHash -Path $binary -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-TrackingFile $hashFile $binaryHash
    Write-TrackingFile (Join-Path $installDir 'version') $VERSION

    $installedFile = Join-Path $installDir 'installed'
    $installedVersions = ''
    if (Test-Path $installedFile) { $installedVersions = [System.IO.File]::ReadAllText($installedFile) }
    if ((($installedVersions -replace "`r", '') -split "`n") -notcontains $VERSION) {
        [System.IO.File]::AppendAllText($installedFile, "$VERSION`n")
    }

    # Written last, like setupSlpService() — its presence marks a completed
    # install, so it must never precede a verified binary.
    Write-TrackingFile $markerFile $VERSION

    Write-Output "SLP $VERSION installed."
    exit 0
}
catch {
    Write-Output "SLP framework install failed: $($_.Exception.Message)"
    exit 1
}
finally {
    if (Test-Path $archivePath) { Remove-Item -Force $archivePath -ErrorAction SilentlyContinue }
}
