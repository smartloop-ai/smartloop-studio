# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Smartloop Studio — an Electron + React desktop app for chatting with local SLMs (Small Language Models). It manages a local backend service called SLP (installed at `~/.smartloop/`) that handles model inference, document indexing, and RAG. The app connects to SLP over HTTP on localhost.

## Commands

```bash
# Development (web only, no Electron shell)
npm run dev              # Vite dev server on :5173

# Development (full Electron app with hot-reload)
make electron-dev        # Starts Vite + Electron concurrently

# Build
npm run build            # TypeScript check + Vite build → dist-web/
make build-electron      # Full Electron package for current platform

# Lint
npm run lint             # ESLint (TS/TSX)

# Clean test (resets ~/.smartloop, restarts app)
make test
```

No test suite exists — `make test` is an end-to-end manual test that wipes local state and relaunches.

## Architecture

### Two-process Electron model

- **Main process** (`electron/main.js`): Window management, IPC handlers, SLP service lifecycle, OAuth flow, SQLite database, system tray. All Node.js / filesystem / child-process work lives here.
- **Renderer process** (`src/`): React SPA. Communicates with main process exclusively through `window.electronAPI` (exposed via `electron/preload.js`). No direct Node.js access.

### Electron main-process modules (`electron/`)

| File | Purpose |
|---|---|
| `main.js` | IPC handler registration, window creation, startup flow (health check → install → bootstrap) |
| `preload.js` | Context bridge — defines the full `window.electronAPI` surface |
| `slp-service.js` | Start/stop/health-check the local SLP binary, port management |
| `slp-setup.js` | Download and install the SLP binary from `dl.smartloop.ai`, version management |
| `database.js` | SQLite via better-sqlite3 — projects, conversations, messages, settings, MCP servers, folders, document status |
| `tray.js` | System tray icon and menu |
| `bootstrap-progress.js` | Normalize SSE progress events from the SLP bootstrap endpoint |

### React app (`src/`)

- **Routing**: React Router with two routes: `/` (Home/Chat) and `/settings`
- **Layout**: `AppLayout` wraps all pages — sidebar (280px) + content area
- **State**: `AuthContext` provides user auth; no Redux or global store — state is local to components and services
- **Services** (`src/app/services/`): Thin wrappers over `window.electronAPI.db.*` and IPC calls — `StorageService`, `ConversationService`, `ProjectService`, `DocumentService`, `McpServerService`
- **Chat** (`src/app/components/chat.tsx`): Uses the OpenAI SDK pointed at the local SLP endpoint (OpenAI-compatible API). Streams responses via SSE. Renders markdown with Streamdown.
- **Path alias**: `@/` maps to `./src/` (configured in both `vite.config.ts` and `tsconfig.json`)

### Key data flow

1. Chat component calls `getLocalApiEndpoint()` (from `src/app/constants.jsx`) to get the local SLP URL
2. Creates an OpenAI client pointed at that URL
3. Streams completions via the OpenAI SDK
4. Messages are persisted to SQLite through `window.electronAPI.db.addMessages()`

### Local SLP service

- Binary installed at `~/.smartloop/<version>/bin/slp`
- Writes its port to `~/.smartloop/server.port`
- SQLite DB at `~/.smartloop/studio.db`
- Provides OpenAI-compatible `/v1/chat/completions`, plus custom endpoints for documents, projects, auth, models, and bootstrap
- On first launch: downloads SLP binary → starts service → runs bootstrap (downloads default model via SSE progress)

### Storage

Two storage layers:
- **electron-store** (encrypted with machine ID): Key-value for tokens and preferences
- **better-sqlite3**: Structured data — projects, conversations, messages, settings, MCP servers, document folders/status, memory/TPS metrics

## Environment Variables

Set in `.env.local`:
```
VITE_BASE_URL=https://api.smartloop.ai    # Cloud API (used for OAuth)
VITE_APP_URL=https://app.smartloop.ai     # Cloud frontend (OAuth redirect)
SLP_BASE_URL=https://dl.smartloop.ai      # SLP download base URL (default)
```

In renderer code, access via `import.meta.env.VITE_*` (not `process.env`).

## Conventions

- UI: Material UI (MUI v6) + Tailwind CSS, dark theme
- `@typescript-eslint/no-explicit-any` is off — `any` is used freely
- Electron IPC channels follow the pattern `db-<entity>-<action>` for database ops and `slp-<action>` for SLP service ops
- Deep linking protocol: `smartloop://`
- The app hides to system tray on close (macOS/Linux), doesn't quit



## Best practices

-  Use tailwind css, avoid inline box css at all times
-  This is an electron desktop app therefore avoid using web fallbacks
-  use main.js electron APIs instead of using `useeffect` react hook to keep things centralize
-  Use consistent margin ,padding when possible, utilize flex at all times
-  Use theme color, instead of random colors that does not go with overall look and feed
