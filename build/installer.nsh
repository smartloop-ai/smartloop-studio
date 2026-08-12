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

; The SLP framework now ships INSIDE the app bundle (electron-builder.yml
; extraResources → resources\slp) and is copied to %USERPROFILE%\.smartloop on
; first launch (electron/build-mode.js → copyBundledSlp in slp-setup.js). The
; installer therefore no longer downloads it from the CDN — nothing to do here.
!macro customInstall
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
