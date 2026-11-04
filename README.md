# Smartloop Studio

A cross-platform desktop app for chatting with **local** small language models (SLMs) — private by default, everything runs on your machine.

Built with Electron, React 19, Vite and TypeScript, it manages a local inference
service called **SLP** (installed at `~/.smartloop/`, bundled with the app) and
talks to it over HTTP on localhost using an OpenAI-compatible API.

## 📋 Overview

| | |
|---|---|
| **App ID** | `ai.smartloop.studio` |
| **Product name** | Smartloop Studio |
| **Version** | see `package.json` (`version`) |
| **SLP framework** | see `SLP_VERSION` in `Makefile` / `electron/slp-setup.js` |
| **Protocol** | `smartloop://` (OAuth callbacks + deep links) |
| **Platforms** | macOS (DMG/zip + Mac App Store), Windows (NSIS), Linux (AppImage/deb) |

### What it does

- **Local chat** — streams completions from the local SLP service through the
  OpenAI SDK; markdown, code, math, and mermaid rendered with Streamdown.
- **Projects** — group conversations, documents, MCP servers, and skills; export
  and import a project as a zip.
- **Documents & RAG** — upload files into a project, watch indexing progress over
  SSE, browse them in the built-in document viewer.
- **Skills** — per-project `skills/<name>/SKILL.md` files, editable in-app.
- **MCP servers** — configure Model Context Protocol servers per project.
- **Model management** — download, enable/disable, load/unload models; switch SLP
  framework versions; live RAM / TPS metrics.
- **System tray** — closing the window hides to tray instead of quitting.
- **Auto-update** — electron-updater against the Smartloop release feed.

## 🚀 Getting Started

### Prerequisites

- Node.js v20+
- npm

### Installation

```bash
npm install
```

### Development

Full Electron app with hot-reload (Vite + Electron together):

```bash
make electron-dev
```

On Windows, use the PowerShell runner:

```powershell
.\scripts\electron.ps1 electron-dev
```

This starts the Vite dev server on `http://localhost:5173`, launches Electron
against it, and auto-reloads on change.

Renderer-only (no Electron shell — most features that need IPC won't work):

```bash
npm run dev
```

Tail the main-process log while the app runs:

```bash
make logs-dev
```

Simulate the sandboxed Mac App Store code paths in dev:

```bash
MAS=1 make electron-dev
```

### First-launch flow

On a clean machine the app health-checks SLP → resolves the framework (packaged
builds run it in place from the app bundle; a dev/unbundled run installs it under
`~/.smartloop/<version>/`) → starts the service, which writes its port to
`~/.smartloop/server.port` → runs bootstrap, downloading the default model with
SSE progress shown on the splash screen.

`make test` wipes `~/.smartloop` and relaunches so you can walk that flow
end-to-end. There is no automated test suite.

## 📦 Building for Production

```bash
make build-electron            # current platform
make build-electron-mac        # macOS DMG + zip (arm64), signed/notarized
make build-electron-windows    # Windows NSIS installer
make build-electron-linux      # Linux AppImage + deb (host arch: x64 or arm64)
make build-electron-mas        # Mac App Store .pkg (sandboxed)
make push-to-mas BUILD=x.y.z   # stage latest SLP, build MAS .pkg, upload to ASC
```

On Windows: `npm run electron-build` or `.\scripts\electron.ps1 build-electron`.

Supporting targets:

```bash
make stage-slp-latest    # download the latest SLP framework into build/slp/
make check-slp-symbols   # fail if staged SLP references deprecated Apple APIs
make rebuild-electron    # quick rebuild, skips npm install
make clean-electron      # remove dist/ and dist-web/
make stop                # stop the running SLP service
make help-electron       # list all Electron targets
```

The SLP framework is **bundled in the app on every platform** (mac, Windows,
Linux) via `extraResources` — nothing is downloaded from a CDN at build time
except through `stage-slp*`.

## 🏗️ Project Structure

```
.
├── electron/                  # Main process (Node.js side)
│   ├── main.js                # IPC handlers, windows, startup flow
│   ├── preload.js             # Context bridge → window.electronAPI
│   ├── slp-service.js         # Start/stop/health-check SLP, port management
│   ├── slp-setup.js           # Install/version the SLP binary
│   ├── database.js            # better-sqlite3 schema + queries
│   ├── bootstrap-progress.js  # Normalize SSE bootstrap progress
│   ├── health-monitor.js      # Background SLP health checks
│   ├── release-checker.js     # Update feed lookup → autoUpdater.setFeedURL
│   ├── tray.js                # System tray icon and menu
│   └── data/                  # Bundled assets (project template)
├── src/                       # React renderer
│   ├── app/pages/             # Home (chat), Settings, Login
│   ├── app/layouts/           # AppLayout — sidebar + content
│   ├── app/components/        # chat, sidebar, right-sidebar, document viewer, …
│   ├── app/contexts/          # Auth, Project, AppStatus, Theme
│   └── app/services/          # Thin wrappers over window.electronAPI.db.*
├── build/                     # Icons, entitlements, NSIS scripts, staged SLP
├── scripts/                   # Signing hooks, release + staging scripts
├── dist-web/                  # Vite build output
├── dist/                      # electron-builder output
├── electron-builder.yml
└── Makefile
```

## 🧩 Architecture

**Two processes.** Everything Node.js — filesystem, child processes, SQLite, SLP
lifecycle, OAuth — lives in the main process. The renderer is a plain React SPA
with no Node access; it reaches the main process only through
`window.electronAPI`, defined in `electron/preload.js`.

**IPC channel naming:**

| Prefix | Purpose | Examples |
|---|---|---|
| `db-*` | SQLite reads/writes | `db-create-conversation`, `db-add-messages`, `db-get-mcp-servers-by-project` |
| `slp-*` | Local service + models | `slp-service-start`, `slp-list-models`, `slp-init-model`, `slp-add-document` |
| `storage-*` | Encrypted key-value store | `storage-get`, `storage-set`, `storage-usage` |
| `updater-*` / `release-*` | Auto-update | `updater-get-status`, `release-check-now` |
| misc | OS integration | `oauth-login`, `select-folder`, `open-external`, `get-machine-id` |

**Chat data flow:** `getLocalApiEndpoint()` (`src/app/constants.jsx`) resolves the
local SLP URL → an OpenAI client is pointed at it → completions stream over SSE →
messages are persisted via `window.electronAPI.db.addMessages()`.

**Routing:** React Router with two routes — `/` (Home/Chat) and `/settings`;
anything else redirects to `/`. `AppLayout` wraps both with a left sidebar
(projects/conversations) and a right sidebar rail (documents, MCP, skills).

### Local SLP service

- Binary: `<app resources>/slp/slp` in packaged builds (run in place — the MAS
  sandbox will not exec a copied binary), otherwise `~/.smartloop/<version>/slp`
- Writable state (`SLP_HOME`): `~/.smartloop/` — or the app container in the MAS build
- Port file: `~/.smartloop/server.port`
- Data: `~/.smartloop/studio.db`, log: `~/.smartloop/server.log`
- Endpoints: OpenAI-compatible `/v1/chat/completions`, plus documents, projects,
  auth, models, and bootstrap

### Storage

- **electron-store** — encrypted with the machine ID; tokens and preferences
- **better-sqlite3** — projects, conversations, messages, settings, MCP servers,
  document folders/status, memory + TPS metrics

## 🛠️ Technology Stack

- **Electron** 39 · **React** 19 · **TypeScript** 5.6 · **Vite** 5
- **UI**: Material UI v7, Tailwind CSS 3, PrimeReact, React Router 6 (dark theme)
- **Chat/markdown**: `openai` SDK, Streamdown (+ code/math/mermaid/CJK plugins)
- **Data**: better-sqlite3, electron-store, node-machine-id
- **Ops**: electron-updater, electron-log, electron-builder

See `CLAUDE.md` for UI conventions (Tailwind-first, theme variables, the outlined
label/badge style guide).

## 🔐 Security

- Context isolation on, node integration off in the renderer
- All privileged work behind explicit IPC handlers in the preload bridge
- Local storage encrypted with the machine ID
- OAuth handled in the system browser, returning via `smartloop://`
- macOS builds are hardened-runtime signed and notarized; the MAS build runs
  under the App Sandbox; Windows builds are Authenticode-signed in CI

## 📝 Environment Variables

Create `.env.local`:

```env
VITE_BASE_URL=https://api.smartloop.ai    # Cloud API (OAuth, releases)
VITE_APP_URL=https://app.smartloop.ai     # Cloud frontend (OAuth redirect)
SLP_BASE_URL=https://dl.smartloop.ai      # SLP framework download base
NODE_ENV=development
PORT=5173
```

In renderer code read these via `import.meta.env.VITE_*` — not `process.env`.

## 🚢 Distribution

Artifacts land in `dist/`:

- **macOS**: `studio-<version>-arm64.dmg` / `.zip`; `.pkg` for the App Store
- **Windows**: `studio-Setup-<version>.exe` (NSIS, assisted installer)
- **Linux**: `.AppImage` and `.deb` (x64, arm64)

For cutting a production release — the GitHub Actions flow, versioning, tagging,
and publishing to the update feed — see [RELEASING.md](RELEASING.md).

## 🤝 Contributing

Contributions are welcome! Smartloop Studio is open source under the
[Apache License 2.0](LICENSE), and every contribution is accepted under the same
license.

1. Fork the repo and create a branch from `main`.
2. Make your change; run `npm run lint` and `npm run build`.
3. Sign off your commits (`git commit -s`) per the
   [Developer Certificate of Origin](https://developercertificate.org/).
4. Open a pull request against `main` describing what changed and how you tested it.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, including how to report
bugs and security issues.

## 📄 License

Copyright 2026 Smartloop Inc.

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and
[NOTICE](NOTICE) for details.

**SLP is not covered by this license.** The SLP inference framework that the app
downloads or bundles is proprietary software from Smartloop Inc., distributed
under its own terms. The Apache 2.0 license applies only to the source code in
this repository.

**Trademarks.** "Smartloop", "Smartloop Studio" and the Smartloop logos are
trademarks of Smartloop Inc. As section 6 of the Apache License states, the
license does not grant permission to use them. If you distribute a modified
build, please give it a different name and icon.

## 📖 Learn More

- [Electron](https://www.electronjs.org/docs) · [Vite](https://vitejs.dev/) · [React](https://react.dev/) · [electron-builder](https://www.electron.build/)

---

© 2026 Smartloop Inc. · Licensed under [Apache 2.0](LICENSE)
