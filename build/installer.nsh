; Custom NSIS steps for the Smartloop Studio installer (electron-builder
; nsis.include). LogicLib is include-guarded, so this is safe even though the
; electron-builder template already pulls it in.
!include LogicLib.nsh

; Single-source the SLP version from electron/slp-setup.js at compile time so
; the installer can never drift from what the app expects.
!searchparse /file "${PROJECT_DIR}\electron\slp-setup.js" "const VERSION = '" SLP_VERSION "';"

!define SLP_ARCHIVE_URL "https://dl.smartloop.ai/slp/${SLP_VERSION}/windows-amd64-slp.zip"

; electron-builder's install section starts with `SetDetailsPrint none` and
; customInstall only runs after the old-version uninstall and app-file
; extraction — so the whole first phase of the install showed a bare progress
; bar with no status text. CHECK_APP_RUNNING is the earliest hook inside the
; install section, so re-enable the status text there. Defining
; customCheckAppRunning makes allowOnlyOneInstallerInstance.nsh skip its own
; getProcessInfo include and $pid declaration (both are guarded by
; !ifmacrondef customCheckAppRunning), so provide them here before delegating
; to the stock _CHECK_APP_RUNNING implementation.
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  SetDetailsPrint both
  DetailPrint "Preparing to install ${PRODUCT_NAME}..."
  ; Defining customCheckAppRunning also makes the stock CHECK_APP_RUNNING skip
  ; its IS_POWERSHELL_AVAILABLE insertion (it only runs in the !else branch).
  ; _CHECK_APP_RUNNING -> FIND_PROCESS/KILL_PROCESS read $IsPowerShellAvailable,
  ; so declare and populate it here first (mirroring the stock !else branch),
  ; otherwise NSIS warns about the unknown var and the build fails (warnings are
  ; treated as errors). $PowerShellPath/$CmdPath are already set by the caller.
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
!macroend

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
  ; Status text is normally already on (customCheckAppRunning above), but that
  ; hook is skipped for UAC inner instances — keep this as a safety net so the
  ; (long) SLP download/install phase always shows what it is doing.
  SetDetailsPrint both

  File "/oname=$PLUGINSDIR\install-slp.ps1" "${BUILD_RESOURCES_DIR}\install-slp.ps1"

  ; Skip the (large) download when a usable SLP is already installed.
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-slp.ps1" -Version "${SLP_VERSION}" -CheckOnly'
  Pop $R0
  ${If} $R0 == "10"
    DetailPrint "SLP framework already installed - skipping download."
  ${ElseIf} ${Silent}
    ; Silent install (/S, Microsoft Store): a silent installer has no InstFiles
    ; window to show a progress bar, and the Store can't render sub-progress of a
    ; Win32 silent installer — it only tracks its own package download and then
    ; waits for our process to exit. Downloading the (large) SLP framework here
    ; would therefore stall behind an invisible, unbounded wait. Defer it to
    ; first launch instead, where the app's splash bootstrap shows a real
    ; "Downloading Framework… X / Y MB" progress bar (see updateSplashProgress
    ; in electron/main.js). The runtime install in slp-setup.js is the exact
    ; same code path, so nothing is lost — only made visible.
    DetailPrint "Deferring SLP framework install to first launch (silent mode)."
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
      nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\install-slp.ps1" -Version "${SLP_VERSION}" -ArchivePath "$PLUGINSDIR\windows-amd64-slp.zip"'
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
