; Custom NSIS steps for the Smartloop Studio installer (electron-builder
; nsis.include). LogicLib is include-guarded, so this is safe even though the
; electron-builder template already pulls it in.
!include LogicLib.nsh

; Install the SLP framework (download + extract to %USERPROFILE%\.smartloop)
; as part of app installation so first launch skips the in-app download.
; The heavy lifting lives in install-slp.ps1 — a PowerShell port of the
; install steps in electron/slp-setup.js, which remains the runtime fallback
; whenever this step fails (offline install, blocked download, etc.).
!macro customInstall
  DetailPrint "Installing SLP framework..."
  File "/oname=$PLUGINSDIR\install-slp.ps1" "${BUILD_RESOURCES_DIR}\install-slp.ps1"
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-slp.ps1"'
  Pop $R0
  ${If} $R0 != "0"
    DetailPrint "SLP framework install did not complete (code $R0) — Smartloop Studio will install it on first launch."
  ${EndIf}
!macroend
