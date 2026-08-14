---
name: mas-upload
description: Upload the Mac App Store build (.pkg) to App Store Connect in one shot with xcrun altool. Use when the user says to push/upload/submit the MAS build to the store (e.g. "upload to the app store", "push the mas pkg", "submit to app store connect"). Finds (or builds) the signed .pkg, validates it, then uploads.
argument-hint: [path-to-pkg]
---

# mas-upload

Upload the signed Mac App Store `.pkg` to App Store Connect. The store notarizes on
ingestion, so no local notarization is needed — this is a plain `altool --upload-app`.

Arguments: `$ARGUMENTS` — an optional explicit path to the `.pkg`. If empty, locate it
automatically (see step 2).

## Key facts about this machine / project

- The MAS pkg is signed with **Apple Distribution: Smartloop Inc (YXKDJK6637)** + a **3rd
  Party Mac Developer Installer** cert, using `build/embedded.provisionprofile` (an App
  Store *distribution* profile — the pkg can be uploaded but will NOT launch locally).
- `altool` ships with **full Xcode** (`/Applications/Xcode.app`), but `xcode-select` points
  at CommandLineTools, so plain `xcrun altool` fails. Always run altool with
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` prefixed.
- Team ID / ASC provider short name: **YXKDJK6637**.
- Build output for the MAS target goes to `dist-mas/` (the Makefile's `dist/` is sometimes
  left root-owned by a prior sudo build, so this skill prefers `dist-mas/`).

## Steps

1. **Preflight — tooling & credentials**
   - Confirm altool exists: `ls /Applications/Xcode.app/Contents/SharedFrameworks/ContentDelivery.framework/Versions/A/Resources/altool`. If missing, stop and tell the user full Xcode is required.
   - Resolve credentials (Apple ID + app-specific password), in this order — never print
     the password, never accept it pasted in chat:
     1. Keychain item `AC_PASSWORD` (preferred): check `security find-generic-password -s AC_PASSWORD >/dev/null 2>&1`. If present, use `-p "@keychain:AC_PASSWORD"`; the Apple ID must still be supplied via `$APPLE_ID` or the keychain item's account.
     2. Env vars `$APPLE_ID` and `$APPLE_APP_SPECIFIC_PASSWORD`.
   - If neither is available, STOP and tell the user to run **one** of these themselves via the `!` prefix (so it isn't recorded in chat), then re-run `/mas-upload`:
     - Keychain (one-time): `! xcrun altool --store-password-in-keychain-item AC_PASSWORD -u "you@smartloop.ai" -p "<app-specific-password>"` then `! export APPLE_ID=you@smartloop.ai`
     - Or env: `! export APPLE_ID=you@smartloop.ai APPLE_APP_SPECIFIC_PASSWORD='<app-specific-password>'`
   - Note: env vars set in the user's `!` session may not persist into skill Bash calls. If a needed var reads empty, ask the user to paste the exact `export`s into the current turn, or use the keychain item (which does persist).

2. **Locate the .pkg**
   - If `$ARGUMENTS` is a path to an existing `.pkg`, use it.
   - Else glob, newest first: `ls -t dist-mas/*.pkg dist/*.pkg 2>/dev/null | head -1`.
   - If none found, offer to build it: `make build-electron-mas` (or, to avoid a root-owned
     `dist/`, `npm run build && MAS_BUILD=1 npx electron-builder --mac mas -c.directories.output=dist-mas`). The framework signing step takes several minutes. Then re-glob.
   - Report the resolved pkg path and its version (from the filename / `package.json`).

3. **Validate before uploading**
   - Run:
     ```
     DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
       xcrun altool --validate-app -f "<pkg>" -t macos \
       -u "$APPLE_ID" -p "<password-or-@keychain:AC_PASSWORD>"
     ```
   - If validation fails, show the error and STOP — do not upload.

4. **Upload**
   - Uploading to App Store Connect is an outward-facing, hard-to-reverse publish action.
     Confirm the pkg path + version with the user before running, unless they already said
     "upload" / "one shot" this turn.
   - Run:
     ```
     DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
       xcrun altool --upload-app -f "<pkg>" -t macos \
       -u "$APPLE_ID" -p "<password-or-@keychain:AC_PASSWORD>"
     ```
   - On success, altool prints a delivery UUID. Report it, and remind the user the build then
     needs a few minutes to appear (and be processed) under TestFlight / App Store Connect.

5. **On failure**
   - Surface altool's full error. Common ones: `Unable to authenticate` (wrong/expired
     app-specific password), `ITMS-90xxx` validation/metadata errors (fix in the app/pkg or
     App Store Connect), or a duplicate build number (bump `version` in `package.json` and
     rebuild — CFBundleVersion must strictly increase per upload).
