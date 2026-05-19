param(
    [Parameter(Position = 0)]
    [string]$Target = 'help-electron'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    Write-Host $Message
    & $Action
}

function Invoke-Npm {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

function Start-NpmProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $npmExecutable = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npmExecutable) {
        $npmExecutable = (Get-Command npm -ErrorAction Stop).Source
    }

    return Start-Process -FilePath $npmExecutable -ArgumentList $Arguments -PassThru -NoNewWindow
}

function Wait-ForVite {
    Invoke-Npm @('exec', '--', 'wait-on', 'http://localhost:5173')
}

function Remove-BuildArtifacts {
    foreach ($path in @('dist', 'dist-web')) {
        if (Test-Path $path) {
            Remove-Item -Recurse -Force $path
        }
    }
}

function Ensure-NsisTemplates {
    $templateDir = Join-Path $ProjectRoot 'node_modules\app-builder-lib\templates\nsis'
    $version = 'v26.0.12'
    $files = @(
        'messages.yml',
        'assistedMessages.yml'
    )

    foreach ($file in $files) {
        $destination = Join-Path $templateDir $file
        if (Test-Path $destination) {
            continue
        }

        $uri = "https://raw.githubusercontent.com/electron-userland/electron-builder/$version/packages/app-builder-lib/templates/nsis/$file"
        Write-Host "Restoring missing NSIS template: $file"
        Invoke-WebRequest -Uri $uri -OutFile $destination
    }
}

function Stop-StaleElectronInstances {
    $candidates = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -ieq 'electron.exe' -and
            ($_.CommandLine -match [regex]::Escape($ProjectRoot) -or $_.CommandLine -match 'electron\s+\.')
        }

    foreach ($process in $candidates) {
        Write-Host "Stopping stale Electron instance: $($process.ProcessId)"
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Stop-StaleViteProcesses {
    $candidates = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            ($_.Name -ieq 'node.exe' -or $_.Name -ieq 'npm.cmd' -or $_.Name -ieq 'vite.exe') -and
            ($_.CommandLine -match [regex]::Escape($ProjectRoot) -and $_.CommandLine -match 'vite')
        }

    foreach ($process in $candidates) {
        Write-Host "Stopping stale Vite instance: $($process.ProcessId)"
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Show-Help {
    Write-Host ''
    Write-Host 'Electron Windows Targets:'
    Write-Host ''
    Write-Host '  .\scripts\electron.ps1 electron-dev            Run Electron app in development mode'
    Write-Host '  .\scripts\electron.ps1 build-electron         Build Electron app for current platform'
    Write-Host '  .\scripts\electron.ps1 build-electron-windows Build Electron app for Windows'
    Write-Host '  .\scripts\electron.ps1 clean-electron         Clean dist and dist-web'
    Write-Host '  .\scripts\electron.ps1 rebuild-electron       Quick rebuild for Windows packaging'
    Write-Host ''
}

switch ($Target) {
    'help-electron' {
        Show-Help
    }
    'clean-electron' {
        Invoke-Step 'Cleaning Electron build artifacts...' { Remove-BuildArtifacts }
    }
    'run-electron-dev' {
        Invoke-Step 'Starting Electron app in development mode...' {
            Stop-StaleElectronInstances
            Stop-StaleViteProcesses
            $viteProcess = Start-NpmProcess @('exec', '--', 'vite', '--port', '5173', '--strictPort')
            try {
                Wait-ForVite

                $previousNodeEnv = $env:NODE_ENV
                $previousPort = $env:PORT
                $previousBrowser = $env:BROWSER

                $env:NODE_ENV = 'development'
                $env:PORT = '5173'
                $env:BROWSER = 'none'

                try {
                    Invoke-Npm @('run', 'electron')
                }
                finally {
                    $env:NODE_ENV = $previousNodeEnv
                    $env:PORT = $previousPort
                    $env:BROWSER = $previousBrowser
                }
            }
            finally {
                if ($viteProcess -and -not $viteProcess.HasExited) {
                    Stop-Process -Id $viteProcess.Id -Force
                }
            }
        }
    }
    'electron-dev' {
        Invoke-Step 'Starting Electron app in development mode...' {
            Stop-StaleElectronInstances
            Stop-StaleViteProcesses
            $viteProcess = Start-NpmProcess @('exec', '--', 'vite', '--port', '5173', '--strictPort')
            try {
                Wait-ForVite

                $previousNodeEnv = $env:NODE_ENV
                $previousPort = $env:PORT
                $previousBrowser = $env:BROWSER

                $env:NODE_ENV = 'development'
                $env:PORT = '5173'
                $env:BROWSER = 'none'

                try {
                    Invoke-Npm @('run', 'electron')
                }
                finally {
                    $env:NODE_ENV = $previousNodeEnv
                    $env:PORT = $previousPort
                    $env:BROWSER = $previousBrowser
                }
            }
            finally {
                if ($viteProcess -and -not $viteProcess.HasExited) {
                    Stop-Process -Id $viteProcess.Id -Force
                }
            }
        }
    }
    'build-electron' {
        Invoke-Step 'Cleaning Electron build artifacts...' { Remove-BuildArtifacts }
        Invoke-Step 'Installing dependencies...' { Invoke-Npm @('install') }
        Invoke-Step 'Building Vite app...' { Invoke-Npm @('run', 'build') }
        Invoke-Step 'Ensuring electron-builder NSIS templates...' { Ensure-NsisTemplates }
        Invoke-Step 'Packaging Electron app...' { Invoke-Npm @('exec', '--', 'electron-builder', '--win') }
    }
    'build-electron-windows' {
        Invoke-Step 'Cleaning Electron build artifacts...' { Remove-BuildArtifacts }
        Invoke-Step 'Installing dependencies...' { Invoke-Npm @('install') }
        Invoke-Step 'Building Vite app...' { Invoke-Npm @('run', 'build') }
        Invoke-Step 'Ensuring electron-builder NSIS templates...' { Ensure-NsisTemplates }
        Invoke-Step 'Packaging Electron app for Windows...' { Invoke-Npm @('exec', '--', 'electron-builder', '--win') }
    }
    'rebuild-electron' {
        Invoke-Step 'Building Vite app...' { Invoke-Npm @('run', 'build') }
        Invoke-Step 'Ensuring electron-builder NSIS templates...' { Ensure-NsisTemplates }
        Invoke-Step 'Packaging Electron app for Windows...' { Invoke-Npm @('exec', '--', 'electron-builder', '--win') }
    }
    default {
        Write-Error "Unknown target '$Target'. Run '.\\scripts\\electron.ps1 help-electron' for available targets."
    }
}