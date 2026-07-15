; Custom NSIS steps for the Smartloop Studio installer (electron-builder
; nsis.include). LogicLib is include-guarded, so this is safe even though the
; electron-builder template already pulls it in.
!include LogicLib.nsh

; Single-source the SLP version from electron/slp-setup.js at compile time so
; the installer can never drift from what the app expects.
!searchparse /file "${PROJECT_DIR}\electron\slp-setup.js" "const VERSION = '" SLP_VERSION "';"

!define SLP_ARCHIVE_URL "https://dl.smartloop.ai/slp/${SLP_VERSION}/windows-amd64-slp.zip"

; Install the SLP framework into %USERPROFILE%\.smartloop as part of app
; installation so first launch skips the in-app download. The download runs
; through the INetC plugin (real progress UI); extraction/verification and the
; tracking files live in install-slp.ps1 — a PowerShell port of the install
; steps in electron/slp-setup.js, which remains the runtime fallback whenever
; any of this fails (offline install, blocked download, etc.).
!macro customInstall
  File "/oname=$PLUGINSDIR\install-slp.ps1" "${BUILD_RESOURCES_DIR}\install-slp.ps1"

  ; Skip the (large) download when a usable SLP is already installed.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-slp.ps1" -Version "${SLP_VERSION}" -CheckOnly'
  Pop $R0
  ${If} $R0 == "10"
    DetailPrint "SLP framework already installed - skipping download."
  ${Else}
    DetailPrint "Downloading SLP framework ${SLP_VERSION}..."
    inetc::get /caption "SLP framework ${SLP_VERSION}" /resume "" "${SLP_ARCHIVE_URL}" "$PLUGINSDIR\windows-amd64-slp.zip" /end
    Pop $R0
    ${If} $R0 == "OK"
      DetailPrint "Installing SLP framework ${SLP_VERSION}..."
      nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-slp.ps1" -Version "${SLP_VERSION}" -ArchivePath "$PLUGINSDIR\windows-amd64-slp.zip"'
      Pop $R0
      ${If} $R0 != "0"
        DetailPrint "SLP framework install did not complete (code $R0) - Smartloop Studio will install it on first launch."
      ${EndIf}
      Delete "$PLUGINSDIR\windows-amd64-slp.zip"
    ${Else}
      DetailPrint "SLP framework download failed ($R0) - Smartloop Studio will install it on first launch."
    ${EndIf}
  ${EndIf}
!macroend
