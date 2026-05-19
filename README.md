# Smartloop Studio

A cross-platform desktop application built with Electron, React, and Vite.

## 📋 Overview

**SmartLoop Studio** is an Electron-based desktop application that provides a native experience across macOS, Windows, and Linux. The app uses:

- **Electron** - Cross-platform desktop framework
- **React** - UI framework
- **Vite** - Fast build tool and dev server
- **TypeScript** - Type-safe development
- **Material-UI** - Component library

### App Configuration

- **App ID**: `ai.smartloop.studio`
- **Product Name**: Smartloop Studio
- **Version**: 1.0.0
- **Protocol**: `smartloop://` (for OAuth callbacks)

## 🚀 Getting Started

### Prerequisites

- Node.js (v20 or higher recommended)
- npm or yarn

### Installation

```bash
npm install
# or
yarn install
```

### Development

Run the Electron app in development mode with hot-reload:

```bash
make electron-dev
# or
npm run electron-dev
```

On Windows, the equivalent Make-style PowerShell runner is:

```powershell
.\scripts\electron.ps1 electron-dev
```

This will:
1. Start the Vite dev server on `http://localhost:5173`
2. Launch Electron with the dev server
3. Auto-reload on code changes

For web-only development (without Electron):

```bash
make run
# or
npm run dev
```

## 📦 Building for Production

The Makefile provides convenient targets for building the Electron app:

### Build for Current Platform

```bash
make build-electron
```

On Windows, use either:

```bash
npm run electron-build
```

or:

```powershell
.\scripts\electron.ps1 build-electron
```

### Build for Specific Platforms

```bash
# macOS (DMG and zip for both arm64 and x64)
make build-electron-mac

# Windows (NSIS installer and portable exe)
make build-electron-windows

# Linux (AppImage and deb)
make build-electron-linux

# All platforms
make build-electron-all
```

### Quick Rebuild

For faster iteration (skips npm install):

```bash
make rebuild-electron
```

### Clean Build Artifacts

```bash
make clean-electron
```

## 🏗️ Project Structure

```
.
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # Preload script for IPC
├── src/                 # React app source code
├── public/              # Static assets
├── dist-web/            # Built Vite app (production)
├── dist/                # Built Electron app packages
├── electron-builder.yml # Electron Builder configuration
├── package.json         # Dependencies and scripts
├── vite.config.ts       # Vite configuration
└── Makefile             # Build automation
```

## 🔧 Available Make Targets

View all Electron-related targets:

```bash
make help-electron
```

### Development Targets

- `make electron-dev` - Run in development mode
- `make run` - Run web version only
- `make install` - Install dependencies

### Build Targets

- `make build-electron` - Build for current platform
- `make build-electron-mac` - Build for macOS
- `make build-electron-windows` - Build for Windows
- `make build-electron-linux` - Build for Linux
- `make build-electron-all` - Build for all platforms

### Utility Targets

- `make rebuild-electron` - Quick rebuild
- `make clean-electron` - Clean artifacts
- `make check-electron` - Verify setup

## 🛠️ Technology Stack

### Core
- **Electron** (v39.2.7) - Desktop framework
- **React** (v18.3.1) - UI library
- **TypeScript** (v5.6.3) - Type safety
- **Vite** (v5.4.11) - Build tool

### UI Components
- Material-UI (@mui/material)
- PrimeReact
- React Router
- Markdown rendering (react-markdown, marked)

### Electron Features
- **electron-store** - Encrypted persistent storage
- **node-machine-id** - Device identification
- **OAuth flow** - System browser authentication
- **Deep linking** - Protocol handler (`smartloop://`)
- **Auto-updates** - electron-builder support

## 🔐 Security Features

- Context isolation enabled
- Node integration disabled in renderer
- Secure IPC communication via preload script
- Encrypted local storage using machine ID
- OAuth handled via system browser

## 📝 Development Notes

### Environment Variables

Create `.env.local` for development:

```env
VITE_APP_URL=https://app.smartloop.ai
VITE_BASE_URL=https://api.smartloop.ai
NODE_ENV=development
PORT=5173
```

### IPC Handlers

The app uses IPC for secure communication:

- `get-machine-id` - Get unique device ID
- `storage-get/set/remove/clear` - Persistent storage
- `oauth-login` - Initiate OAuth flow
- `validate-token` - Verify authentication
- `refresh-token` - Refresh JWT token

## 🚢 Distribution

Built applications are placed in the `dist/` folder:

- **macOS**: `.dmg` and `.zip` files (arm64 and x64)
- **Windows**: Setup `.exe` (NSIS) and portable `.exe`
- **Linux**: `.AppImage` and `.deb` packages

## 📖 Learn More

- [Electron Documentation](https://www.electronjs.org/docs)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [electron-builder](https://www.electron.build/)


---

© 2025 Smartloop Inc.
