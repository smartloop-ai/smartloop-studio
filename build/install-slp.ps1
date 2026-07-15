# Installs the SLP framework during Smartloop Studio setup (Windows).
#
# PowerShell port of installService() in electron/slp-setup.js. Normally the
# NSIS installer (build/installer.nsh) downloads the archive first via the
# INetC plugin (which has a real progress UI) and passes it in via
# -ArchivePath; this script then extracts it to
# %USERPROFILE%\.smartloop\<version>\, verifies the binary, and writes the
# same tracking files the app checks at startup (.installed-version,
# .binary-hash, .archive-etag, version, installed) so first launch skips the
# in-app download. Run without -ArchivePath it downloads the archive itself
# (standalone/dev use). Any failure is non-fatal to the app: the runtime
# installer (slp-setup.js) takes over on first launch.
#
# Modes (exit codes):
#   -CheckOnly     10 = already installed, 0 = install needed, 1 = error
#   default         0 = installed OK,      1 = error
param(
    [string]$Version = '',
    [string]$ArchivePath = '',
    [switch]$CheckOnly
)

# Fallback when no -Version is passed (the installer always passes one).
# Kept in sync with VERSION in electron/slp-setup.js by release-prod.yml.
$DEFAULT_VERSION = '1.0.3'
if (-not $Version) { $Version = $DEFAULT_VERSION }

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$baseUrl = 'https://dl.smartloop.ai'
if ($env:SLP_BASE_URL) { $baseUrl = $env:SLP_BASE_URL.TrimEnd('/') }

$installDir  = Join-Path $env:USERPROFILE '.smartloop'
$versionDir  = Join-Path $installDir $Version
$cacheDir    = Join-Path $installDir 'cache'
$markerFile  = Join-Path $installDir '.installed-version'
$hashFile    = Join-Path $installDir '.binary-hash'
$etagFile    = Join-Path $installDir '.archive-etag'
$archiveUrl  = "$baseUrl/slp/$Version/windows-amd64-slp.zip"

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

# Mirrors needsInstall() in slp-setup.js (minus the hash re-check — a hash
# mismatch is caught and repaired by the app at first launch).
function Test-AlreadyInstalled {
    if (-not (Test-Path $markerFile)) { return $false }
    $installed = ([System.IO.File]::ReadAllText($markerFile)).Trim()
    if (-not $installed -or -not (Test-SemverGte $installed $Version)) { return $false }
    $installedBinary = Join-Path (Join-Path $installDir $installed) 'slp.exe'
    return (Test-Path $installedBinary) -and ((Get-Item $installedBinary).Length -gt 0)
}

# Streamed download with percentage lines (surfaced in the installer's details
# pane). Fallback for standalone use — the installer itself downloads via
# INetC and passes -ArchivePath instead. Returns the response ETag.
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

# Mirrors storeRemoteEtag() in slp-setup.js — used when the archive arrived
# via -ArchivePath so no download response was seen. Non-fatal on failure.
function Get-RemoteEtag([string]$Url) {
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Method = 'HEAD'
        $request.AllowAutoRedirect = $true
        $request.Timeout = 10000
        $response = $request.GetResponse()
        try { return $response.Headers['ETag'] } finally { $response.Close() }
    }
    catch { return $null }
}

if ($CheckOnly) {
    if (Test-AlreadyInstalled) { exit 10 }
    exit 0
}

$ownArchive = $false
$archive = $ArchivePath
try {
    if (Test-AlreadyInstalled) {
        Write-Output 'SLP already installed - skipping framework install.'
        exit 0
    }

    New-Item -ItemType Directory -Force -Path $installDir, $cacheDir, $versionDir | Out-Null

    if ($archive -and (Test-Path $archive) -and ((Get-Item $archive).Length -gt 0)) {
        $etag = Get-RemoteEtag $archiveUrl
    }
    else {
        $archive = Join-Path $cacheDir "slp-$Version-windows-amd64.zip"
        $ownArchive = $true
        Write-Output "Downloading SLP framework $Version from $archiveUrl"
        $etag = Get-SlpArchive $archiveUrl $archive
    }
    if ($etag) { Write-TrackingFile $etagFile ($etag -replace '"', '') }

    # Clean the version dir, then extract. Like slp-setup.js, strip a
    # top-level slp/ wrapper so the binary lands at <versionDir>\slp.exe, and
    # count verbose tar output against the entry total for progress. tar's -v
    # listing goes to stderr on Windows (BSD tar); route it through cmd so
    # PowerShell 5.1 doesn't turn stderr lines into errors.
    Get-ChildItem -Path $versionDir -Force | Remove-Item -Recurse -Force

    $entries = @(cmd /c "tar -tf `"$archive`" 2>&1")
    if ($LASTEXITCODE -ne 0) { throw 'tar could not list the downloaded archive' }
    $total = $entries.Count
    $topLevel = @($entries | ForEach-Object { ($_ -split '/')[0] } | Sort-Object -Unique)
    $strip = ''
    if ($topLevel.Count -eq 1 -and $topLevel[0] -eq 'slp') { $strip = ' --strip-components=1' }

    Write-Output 'Extracting SLP framework... 0%'
    $count = 0
    $lastPct = -1
    cmd /c "tar -xvf `"$archive`" -C `"$versionDir`"$strip 2>&1" | ForEach-Object {
        $count++
        if ($total -gt 0) {
            $pct = [int](($count * 100) / $total)
            if ($pct -ge ($lastPct + 5)) {
                $lastPct = $pct
                Write-Output "Extracting SLP framework... $pct%"
            }
        }
    }
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
    Write-TrackingFile (Join-Path $installDir 'version') $Version

    $installedFile = Join-Path $installDir 'installed'
    $installedVersions = ''
    if (Test-Path $installedFile) { $installedVersions = [System.IO.File]::ReadAllText($installedFile) }
    if ((($installedVersions -replace "`r", '') -split "`n") -notcontains $Version) {
        [System.IO.File]::AppendAllText($installedFile, "$Version`n")
    }

    # Written last, like setupSlpService() — its presence marks a completed
    # install, so it must never precede a verified binary.
    Write-TrackingFile $markerFile $Version

    Write-Output "SLP $Version installed."
    exit 0
}
catch {
    Write-Output "SLP framework install failed: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($ownArchive -and $archive -and (Test-Path $archive)) {
        Remove-Item -Force $archive -ErrorAction SilentlyContinue
    }
}
