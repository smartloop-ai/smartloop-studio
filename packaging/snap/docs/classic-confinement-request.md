Title: Classic confinement request for smartloop-studio (SmartLoop Studio)

| Field | Value |
| --- | --- |
| Snap name | smartloop-studio |
| Developer | Smartloop Inc |
| Contact | support@smartloop.ai |
| Source code | Closed-source (proprietary), not publicly available |

Hi, I'd like to request classic confinement for the `smartloop-studio` snap.

The application is SmartLoop Studio, a desktop app built with Electron and
packaged from an existing Debian package (.deb). Classic confinement is
required for the following technical reasons:

1. Electron/Chromium sandbox
   The app ships the Chromium `chrome-sandbox` setuid helper. Inside a snap
   the setuid bit is stripped, so the setuid sandbox cannot initialize, and
   the user-namespace fallback is blocked for strict snaps on modern Ubuntu
   releases (23.10+ restrict unprivileged user namespaces, and the snap
   AppArmor profile prevents their use). Without a usable sandbox, Electron
   refuses to launch unless run with `--no-sandbox`, which degrades security.

2. Native Node.js module
   The app bundles a native module (`better-sqlite3`) that reads/writes a
   local SQLite database and temporary files in runtime paths that are not
   reliably covered by the strict `home` interface.

3. Pre-built bundle matching the .deb install
   The snap wraps our self-contained pre-built binary, which dynamically
   links against the host system's GTK/NSS/X11 libraries. Under classic
   confinement it runs on the host libraries and behaves identically to the
   native .deb installation, with no large bundled dependency set and no
   drift between our supported packages and the snap.

The snap is amd64-only, base core24, and requires full desktop and network
access to function as the native install does.
