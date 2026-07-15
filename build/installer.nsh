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
; through the NScurl plugin (vendored at build/x86-unicode/NScurl.dll,
; v26.6.21.315 from github.com/negrutiu/nsis-nscurl — electron-builder
; auto-registers build/<pluginArch>/ as an NSIS plugin dir), which drives the
; InstFiles page's own progress bar instead of popping a separate download
; window like INetC did. Extraction/verification and the tracking files live
; in install-slp.ps1 — a PowerShell port of the install steps in
; electron/slp-setup.js, which remains the runtime fallback whenever any of
; this fails (offline install, blocked download, etc.).
!macro customInstall
  ; electron-builder's install section runs with `SetDetailsPrint none`
  ; (templates/nsis/installSection.nsh), which hides the status text above the
  ; progress bar — so none of the DetailPrint lines below were visible.
  ; Re-enable it here so the (long) SLP download/install phase shows what it
  ; is doing, matching the uninstaller's behavior.
  SetDetailsPrint both

  File "/oname=$PLUGINSDIR\install-slp.ps1" "${BUILD_RESOURCES_DIR}\install-slp.ps1"

  ; Skip the (large) download when a usable SLP is already installed.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-slp.ps1" -Version "${SLP_VERSION}" -CheckOnly'
  Pop $R0
  ${If} $R0 == "10"
    DetailPrint "SLP framework already installed - skipping download."
  ${Else}
    DetailPrint "Downloading SLP framework ${SLP_VERSION}..."
    ; Hand NScurl the InstFiles page's own progress bar (dlg item 1004) and
    ; status text (1006) so the download reuses the installer's single bar.
    ; In silent installs NScurl ignores these and waits silently.
    FindWindow $R1 "#32770" "" $HWNDPARENT
    GetDlgItem $R2 $R1 1004
    GetDlgItem $R3 $R1 1006
    NScurl::http GET "${SLP_ARCHIVE_URL}" "$PLUGINSDIR\windows-amd64-slp.zip" /INSIST /RESUME /PROGRESSWND $R2 /TEXTWND $R3 /STRING TEXT "Downloading SLP framework ${SLP_VERSION} — @XFERSIZE@ of @FILESIZE@ (@SPEED@)" /END
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

; On uninstall, remove everything the app put on the machine: the SLP
; framework, models, and local DB under %USERPROFILE%\.smartloop, plus the
; Electron user-data folder (electron-store, caches). Guarded by ${isUpdated}
; because electron-builder runs the old uninstaller with --updated during an
; in-place upgrade — data must survive updates and only go on real uninstall.
!macro customUnInstall
  ${IfNot} ${isUpdated}
    ; Stop any SLP server still running so its files aren't locked.
    nsExec::Exec 'taskkill /F /T /IM slp.exe'
    Pop $R0

    DetailPrint "Removing SLP framework and application data..."
    RMDir /r "$PROFILE\.smartloop"
    ; Electron userData is named after package.json "name" (no productName
    ; there); also remove the productName variant in case that ever changes.
    RMDir /r "$APPDATA\smartloop-studio"
    RMDir /r "$APPDATA\${APP_FILENAME}"
  ${EndIf}
!macroend
