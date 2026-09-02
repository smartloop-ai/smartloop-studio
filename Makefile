# App service Makefile - Build Docker images, sync secrets, deploy Helm charts, and manage cluster rollouts
BUILD_DIR=bin

# Load local, gitignored config (e.g. Mac App Store publish: APPLE_ID,
# ASC_PROVIDER) from .env so targets like `push-to-mas` pick it up without
# command-line args. Missing .env is fine (the leading `-` ignores that).
-include .env

PROD_PROJECT_ID=smartloop-gcp-us-east
DEV_PROJECT_ID=chris-smartloop-dev

PROD_CLUSTER_REGION=us-west1-b
DEV_CLUSTER_REGION=us-central1-b

# Helper function to get cluster name for a project
define get_cluster_name
$(shell gcloud container clusters list --project=$(1) --format="value(name)" | head -1)
endef

# TODO: switch to us.gcr.io for US region deployments, gcr.io for international
REGISTRY=gcr.io

# #####################################################################
# Local Development Targets
#
# These are for local development with ngrok HTTPS tunneling
# #####################################################################

# Start Next.js server in development mode
run:
	@echo "🚀 Starting Next.js development server on port 3000..."
	npm run dev

# Start Next.js server (production build)
run-prod:
	@echo "🚀 Starting Next.js server on port 3000..."
	npm run build && npm start

# Start both ngrok tunnels (API random + frontend local.smartloop.ai)
ngrok:
	@echo "🚀 Starting ngrok tunnels for both services..."
	@echo "Frontend: https://local.smartloop.ai -> localhost:3000"
	@echo "API: Random ngrok URL -> localhost:8888 (check terminal output)"
	ngrok start --all --config ngrok.yml

# Stop ngrok processes
stop-ngrok:
	@echo "🛑 Stopping ngrok tunnels..."
	@pkill -f "ngrok" || true

# Install dependencies
install:
	npm install

# #####################################################################
# Electron App Build Targets
#
# These are for building the Electron desktop application
# #####################################################################

# Show help for Electron build targets
help-electron:
	@echo ""
	@echo "📱 Electron App Build Targets:"
	@echo ""
	@echo "  make build-electron-linux    - Build Electron app for Linux (AppImage, deb)"
	@echo "  make build-electron-windows  - Build Electron app for Windows (NSIS setup)"
	@echo "  make build-electron-mac      - Build Electron app for macOS (DMG, zip)"
	@echo "  make build-electron-mas      - Build Electron app for the Mac App Store (.pkg)"
	@echo "  make push-to-mas BUILD=x.y.z - Fetch latest SLP framework (by hash), build MAS .pkg, upload it"
	@echo "  make stage-slp-latest        - Download the latest SLP framework into build/slp/ (hash-gated)"
	@echo "  make check-slp-symbols       - Fail if staged build/slp references deprecated Apple APIs"
	@echo "  make build-electron          - Build Electron app for current platform"
	@echo "  make stop                    - Stop the running SLP service"
	@echo "  make rebuild-electron        - Quick rebuild (skips npm install)"
	@echo "  make run-electron-dev        - Run Electron app in development mode"
	@echo "  make logs-dev                - Tail the Electron main-process log (mac/win/linux)"
	@echo "  make logs-mac                - Tail the Electron main-process log (Mac App Store sandbox)"
	@echo "  make logs-slp                - Tail the SLP backend service log (mac/win/linux)"
	@echo "  make logs-slp-mac            - Tail the SLP backend service log (Mac App Store sandbox)"
	@echo "  make clean-electron          - Clean build artifacts"
	@echo ""
	@echo "🐧 Snap Store:"
	@echo ""
	@echo "  make build-snap              - Build the Linux .deb (if needed) and pack the snap"
	@echo "  make push-to-snap            - ...and upload it to the Snap Store (SNAP_CHANNEL=stable)"
	@echo "  make clean-snap              - Clean snapcraft artifacts and the staged .deb"
	@echo ""
	@echo ""
	@echo ""

# End-to-end test: clean install, start, and run the full first-launch flow
test: stop
	@echo "🧹 Cleaning ~/.smartloop for fresh install..."
	@rm -rf $(HOME)/.smartloop
	@echo "✅ Clean slate ready"
	@$(MAKE) run-electron-dev

# SLP version (must match VERSION in electron/slp-setup.js)
# The SLP framework is bundled into every packaged platform from build/slp/ (see
# require-staged-slp) and run in place from inside the app.
SLP_VERSION=1.2.2

# Clean electron build artifacts
clean-electron:
	@echo "🧹 Cleaning Electron build artifacts..."
	rm -rf dist dist-web

# Stop the running SLP service
stop:
	@echo "🛑 Stopping SLP service..."
	@if [ -f "$(HOME)/.smartloop/$(SLP_VERSION)/slp" ]; then \
		$(HOME)/.smartloop/$(SLP_VERSION)/slp agent stop 2>/dev/null && echo "✅ SLP service stopped" || echo "⚠️  SLP service was not running"; \
	else \
		echo "⚠️  SLP binary not found at ~/.smartloop/$(SLP_VERSION)/slp"; \
	fi

# Build Electron app for current platform
build-electron: clean-electron stage-slp require-staged-slp
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "📱 Packaging Electron app..."
	npm run electron-pack

# Build Electron app for Linux
build-electron-linux: clean-electron require-staged-slp
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "🐧 Packaging Electron app for Linux..."
	npm run electron-pack-linux
	@echo "✅ Done! Your app is in the dist/ folder"

# Build Electron app for Windows
build-electron-windows: clean-electron require-staged-slp
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "🪟 Packaging Electron app for Windows..."
	npm run electron-pack-win
	@echo "✅ Done! Your app is in the dist/ folder"

# Fail the build when build/slp/ holds no SLP binary. EVERY platform block in
# electron-builder.yml pulls the framework from build/slp/ via the &res_slp
# anchor — mac and mas, but Windows and Linux too — so an unstaged tree quietly
# packages an app with no agent inside it. That failure is invisible until a
# user's first launch, which is far too late; catch it here, where the fix is
# one command away.
require-staged-slp:
	@if [ ! -s "build/slp/slp" ] && [ ! -s "build/slp/slp.exe" ]; then \
		echo "❌ build/slp is not staged — this build would ship WITHOUT the SLP framework."; \
		echo "   macOS:         make stage-slp          (clone ~/.smartloop/$(SLP_VERSION))"; \
		echo "                  make stage-slp-latest   (fetch the published darwin-arm64 build)"; \
		echo "   Windows/Linux: stage build/slp/ from that platform's framework (CI does this)."; \
		exit 1; \
	fi
	@echo "✅ build/slp staged ($$(du -sh build/slp | cut -f1))"

# Stage the SLP framework into build/slp/ so macOS builds can bundle it
# (electron-builder.yml mac.extraResources ships it inside the .app for both the
# dmg and the MAS build). Uses an APFS clone (cp -c) from the locally installed
# SLP — instant, no extra disk. CI stages build/slp/ its own way (fresh
# download/build) before packaging. No-op if build/slp is already populated.
stage-slp:
	@if [ "$$(uname -s)" != "Darwin" ]; then \
		echo "ℹ️  stage-slp clones the macOS framework — skipping on $$(uname -s)."; \
		echo "   Stage build/slp/ from this platform's own framework (CI does this)."; \
	elif [ -x "build/slp/slp" ]; then \
		echo "✅ build/slp already staged"; \
	elif [ -d "$(HOME)/.smartloop/$(SLP_VERSION)" ]; then \
		echo "📦 Staging SLP $(SLP_VERSION) → build/slp (APFS clone)..."; \
		rm -rf build/slp && mkdir -p build/slp; \
		cp -cR "$(HOME)/.smartloop/$(SLP_VERSION)/." build/slp/; \
		echo "✅ Staged $$(du -sh build/slp | cut -f1) into build/slp"; \
	else \
		echo "❌ No SLP at ~/.smartloop/$(SLP_VERSION). Launch the app once to install it, or stage build/slp/ manually (CI does this)."; \
		exit 1; \
	fi

# Best-effort staging for dev runs. `make electron-dev` wants the framework in
# build/slp/ so a dev session exercises the same bundled run-in-place path the
# shipped app uses, but it must NOT be a precondition for starting: with nothing
# to clone the app simply downloads SLP on first launch, which is exactly what a
# fresh machine does. Packaging is where a missing framework is fatal — that is
# require-staged-slp's job, not this one.
stage-slp-dev:
	@$(MAKE) --no-print-directory stage-slp 2>/dev/null || \
		echo "⚠️  No framework staged — starting anyway; the app will download SLP on first launch."

# Build Electron app for macOS (Developer ID: DMG, zip). SLP is bundled.
build-electron-mac: clean-electron stage-slp require-staged-slp
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "🍎 Packaging Electron app for macOS..."
	npm run electron-pack-mac
	@echo "✅ Done! Your app is in the dist/ folder"

# Stage the LATEST published SLP framework into build/slp/. Gated on the CDN
# archive's ETag (only downloads when the remote framework changed since the last
# stage — otherwise a no-op) and verified against the MD5 the bucket advertises in
# x-goog-hash, so a truncated transfer can't reach the store. Unlike `stage-slp`
# (APFS clone of a possibly-stale local install), this guarantees the store build
# ships the current framework. Pass FORCE=1 to re-download regardless.
stage-slp-latest:
	@SLP_BASE_URL="$(SLP_BASE_URL)" SLP_VERSION="$(SLP_VERSION)" FORCE="$(FORCE)" \
		SLP_PLATFORM="$(SLP_PLATFORM)" SLP_ARCH="$(SLP_ARCH)" \
		bash scripts/stage-slp-latest.sh

# Preflight for any Mac App Store build: refuse to package an SLP framework that
# references the deprecated Accelerate LAPACK helpers. App Review's binary scan
# rejects them ("non-public or deprecated APIs: _dcabs1_, _lsame_,
# _xerbla_array__"), and we bundle the framework verbatim, so a pre-fix build
# staged from the CDN would be rejected days later instead of here. Only an
# *undefined* reference counts — a bundled OpenBLAS that defines these symbols
# itself is not an Apple API reference. See docs/app-store-review.md.
DEPRECATED_APPLE_SYMS := _dcabs1_|_lsame_|_xerbla_array__

check-slp-symbols:
	@if [ ! -d build/slp ]; then echo "❌ build/slp not staged — run 'make stage-slp-latest' first"; exit 1; fi
	@echo "🔎 Scanning build/slp for deprecated Accelerate LAPACK symbols..."
	@hits=$$(find build/slp -type f \( -name "*.so" -o -name "*.dylib" \) -print0 \
		| xargs -0 -n1 sh -c 'nm -arch all "$$0" 2>/dev/null \
			| grep -qE "^ +U ($(DEPRECATED_APPLE_SYMS))$$" && echo "$$0"' \
		| sort); \
	if [ -n "$$hits" ]; then \
		echo "❌ These bundled binaries reference deprecated Accelerate LAPACK APIs:"; \
		echo "$$hits" | sed 's/^/   /'; \
		echo "   App Review will reject this build. Stage an SLP framework built"; \
		echo "   after the smartloop-repo OpenBLAS scipy fix (make stage-slp-latest FORCE=1)."; \
		exit 1; \
	fi
	@echo "✅ No references to deprecated Accelerate LAPACK APIs."

# Build Electron app for the Mac App Store (.pkg). Requires Apple Distribution +
# Mac Installer Distribution certs in the keychain and build/embedded.provisionprofile.
# The store notarizes on ingestion, so no local notarization is done.
build-electron-mas: clean-electron stage-slp-latest require-staged-slp
	@$(MAKE) check-slp-symbols
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "🍎 Packaging Electron app for the Mac App Store..."
	npm run electron-pack-mas
	@echo "✅ Done! Your .pkg is in the dist/ folder — upload it via Transporter"

# ── Publish to the Mac App Store (TestFlight) in one step ────────────────────
# Build the MAS .pkg (into dist-mas/, sidestepping any root-owned dist/) and
# upload it to App Store Connect with altool:
#
#   make push-to-mas BUILD=1.0.353
#
# BUILD is the CFBundleVersion (build number). The marketing version stays
# package.json's `version`; the build number must strictly increase across
# uploads and be at most THREE integer components (Apple rejects 1.0.35.1).
# So iterate as 1.0.351, 1.0.352, 1.0.353, …
#
# Prerequisites:
#   • Apple Distribution + "3rd Party Mac Developer Installer" certs in the keychain
#   • build/embedded.provisionprofile (App Store provisioning profile)
#   • full Xcode installed (altool ships with it, not the CLT)
#   • app-specific password stored in the keychain as AC_PASSWORD:
#       xcrun altool --store-password-in-keychain-item AC_PASSWORD -u <apple-id> -p <pw>
#     altool infers the Apple ID from that item, so APPLE_ID is optional.
# Overrides: ASC_PROVIDER=<team> APPLE_ID=<apple-id>
ASC_PROVIDER ?= YXKDJK6637
APPLE_ID     ?=
ALTOOL       := DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun altool

push-to-mas: stage-slp-latest
	@if [ -z "$(BUILD)" ]; then \
		echo "❌ Set the build number: make push-to-mas BUILD=1.0.353"; \
		echo "   (marketing version stays package.json's; CFBundleVersion must increase, ≤3 integers)"; exit 1; \
	fi
	@if ! echo "$(BUILD)" | grep -qE '^[0-9]+(\.[0-9]+){0,2}$$'; then \
		echo "❌ BUILD='$(BUILD)' invalid — CFBundleVersion is up to three dot-separated integers (e.g. 1.0.353)."; exit 1; \
	fi
	@$(MAKE) check-slp-symbols
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "🍎 Packaging MAS .pkg (build $(BUILD))..."
	@chmod -R u+w dist-mas/mas-arm64 2>/dev/null || true; rm -rf dist-mas/mas-arm64
	MAS_BUILD=1 npx electron-builder --mac mas -c.directories.output=dist-mas -c.buildVersion=$(BUILD)
	@PKG=$$(ls -t dist-mas/mas-arm64/*.pkg 2>/dev/null | head -1); \
	if [ -z "$$PKG" ]; then echo "❌ No .pkg produced in dist-mas/mas-arm64/"; exit 1; fi; \
	echo "🔎 $$PKG"; pkgutil --check-signature "$$PKG" | sed -n '1,2p'; \
	U=""; [ -n "$(APPLE_ID)" ] && U="-u $(APPLE_ID)"; \
	echo "⬆️  Uploading to App Store Connect (provider $(ASC_PROVIDER))…"; \
	$(ALTOOL) --upload-app -f "$$PKG" -t macos $$U -p "@keychain:AC_PASSWORD" --asc-provider "$(ASC_PROVIDER)"
	@echo "✅ Uploaded. Processing takes a few minutes — then assign the build in App Store Connect / TestFlight."

# ── Publish to the Snap Store ────────────────────────────────────────────────
# The snap wraps this repo's Linux .deb. It used to pull the PUBLISHED .deb from
# dl.smartloop.ai, which meant the snap could only be cut after the CDN upload
# and could silently wrap a different build than the one sitting in dist/.
# packaging/snap/ now takes the .deb straight out of dist/ instead:
#
#   make build-snap                      # build the .deb (if needed) + pack the snap
#   make push-to-snap                    # ...and upload it to latest/stable
#   make push-to-snap SNAP_CHANNEL=beta  # release to another channel
#
# Prerequisites:
#   • snapcraft with an initialized LXD build provider (sudo snap install
#     snapcraft --classic; lxd init; usermod -aG lxd $USER)
#   • `snapcraft login` for the upload
#   • build/slp staged — build-electron-linux refuses to package without it
# Packing takes a while and needs several GB of free disk.
SNAP_DIR      = packaging/snap
SNAP_NAME     = smartloop-studio
SNAP_ARCH     = amd64
SNAP_CHANNEL ?= stable
SNAP_YAML     = $(SNAP_DIR)/snap/snapcraft.yaml
# package.json is the single source of truth for the marketing version;
# stage-snap-deb writes it into snapcraft.yaml so the two cannot drift.
APP_VERSION  := $(shell grep -m1 '"version"' package.json | sed 's/.*: *"\([^"]*\)".*/\1/')
LINUX_DEB     = dist/studio-$(APP_VERSION)-$(SNAP_ARCH).deb
# Staged under a version-free name so `version:` is the only line that changes
# in snapcraft.yaml from one release to the next.
SNAP_DEB      = $(SNAP_DIR)/studio-$(SNAP_ARCH).deb
SNAP_FILE     = $(SNAP_DIR)/$(SNAP_NAME)_$(APP_VERSION)_$(SNAP_ARCH).snap

# Put the Linux .deb where snapcraft can reach it and sync the version.
# snapcraft only sees files inside its own project dir, so dist/ cannot be
# referenced from snapcraft.yaml — the .deb has to be copied in.
stage-snap-deb:
	@if [ ! -f "$(LINUX_DEB)" ]; then \
		echo "📦 $(LINUX_DEB) not built yet — staging the Linux SLP framework, then building it..."; \
		$(MAKE) stage-slp-latest SLP_PLATFORM=linux SLP_ARCH=amd64 || exit 1; \
		$(MAKE) build-electron-linux || exit 1; \
	fi
	@if [ ! -s "$(LINUX_DEB)" ]; then echo "❌ Expected $(LINUX_DEB), but it is missing or empty"; exit 1; fi
	@echo "📋 Staging $(LINUX_DEB) → $(SNAP_DEB) ($$(du -h '$(LINUX_DEB)' | cut -f1))"
	@cp -f "$(LINUX_DEB)" "$(SNAP_DEB)"
	@sed -i -e "s|^version: .*|version: $(APP_VERSION)|" "$(SNAP_YAML)"
	@grep -q "^version: $(APP_VERSION)$$" "$(SNAP_YAML)" || { echo "❌ Version bump to $(APP_VERSION) failed in $(SNAP_YAML)"; exit 1; }
	@echo "🔖 $(SNAP_YAML) pinned to version $(APP_VERSION)"

# Pack the snap from the staged .deb. `snapcraft clean` first: the dump part is
# keyed on the source path, which no longer changes between versions, so a stale
# pull would otherwise repackage the previous release's .deb.
build-snap: stage-snap-deb
	@command -v snapcraft >/dev/null || { echo "❌ snapcraft not installed — sudo snap install snapcraft --classic"; exit 1; }
	@echo "🐧 Packing $(SNAP_NAME) $(APP_VERSION) — this takes a while..."
	cd $(SNAP_DIR) && snapcraft clean && snapcraft pack
	@if [ ! -s "$(SNAP_FILE)" ]; then echo "❌ snapcraft did not produce $(SNAP_FILE)"; exit 1; fi
	@echo "✅ Built $$(du -h '$(SNAP_FILE)' | cut -f1) → $(SNAP_FILE)"

# Build and publish in one step. --release makes the new revision current on
# that channel as part of the upload, so there is no separate release call.
push-to-snap: build-snap
	@snapcraft whoami >/dev/null 2>&1 || { echo "❌ Not logged in to the Snap Store — run: snapcraft login"; exit 1; }
	@echo "⬆️  Uploading $(SNAP_FILE) → latest/$(SNAP_CHANNEL)"
	snapcraft upload --release=$(SNAP_CHANNEL) "$(SNAP_FILE)"
	@snapcraft status $(SNAP_NAME) || true
	@echo "✅ $(SNAP_NAME) $(APP_VERSION) is live on latest/$(SNAP_CHANNEL)"

# Drop the snapcraft lifecycle dirs plus the staged .deb and packed .snap.
clean-snap:
	@echo "🧹 Cleaning snap build artifacts..."
	@cd $(SNAP_DIR) && snapcraft clean >/dev/null 2>&1 || true
	@rm -f $(SNAP_DIR)/*.snap "$(SNAP_DEB)"
	@echo "✅ Snap artifacts cleaned"

# Run Electron app in development mode.
# Pass MAS=1 to simulate the Mac App Store build in dev (Vite + Electron
# hot-reload): SMARTLOOP_FORCE_SANDBOX=1 flips isSandboxed() on, so SLP state
# relocates to the app container and SLP runs in place from build/slp/ (staged
# by `make stage-slp`). NOTE: this exercises the sandboxed *code paths*; it does
# NOT enforce the real macOS App Sandbox (a dev Electron isn't a MAS build), so
# it won't reproduce spawn EPERM / mimetypes / sem_open — use `mas-dev` for that.
#   MAS=1 make electron-dev
run-electron-dev: stage-slp-dev
	@echo "🚀 Starting Electron app in development mode..."
ifdef MAS
	@echo "🍎 MAS sandbox simulation (SMARTLOOP_FORCE_SANDBOX=1, run-in-place from build/slp/)"
	SMARTLOOP_FORCE_SANDBOX=1 npm run electron-dev
else
	npm run electron-dev
endif

# Alias for run-electron-dev
electron-dev: run-electron-dev

# App name electron-log uses for its per-user log directory. In dev this is the
# package.json "name" (app.name); keep in sync if that ever changes.
LOG_APP_NAME=smartloop-studio

# Tail the Electron main-process log (electron-log) live. Resolves the
# OS-standard path on macOS, Linux, and Windows (Git Bash / MSYS). Uses `tail -F`
# so it survives electron-log's 5MB rotation and starts streaming once the app
# creates the file — run it alongside `make electron-dev`.
logs-dev:
	@os="$$(uname -s)"; \
	case "$$os" in \
		Darwin) LOG="$(HOME)/Library/Logs/$(LOG_APP_NAME)/main.log";; \
		Linux)  LOG="$(HOME)/.config/$(LOG_APP_NAME)/logs/main.log";; \
		MINGW*|MSYS*|CYGWIN*) LOG="$(HOME)/AppData/Roaming/$(LOG_APP_NAME)/logs/main.log";; \
		*) echo "❌ Unsupported OS: $$os"; exit 1;; \
	esac; \
	if [ ! -f "$$LOG" ]; then \
		echo "⚠️  Log not created yet: $$LOG"; \
		echo "   Start the app (make electron-dev) — tailing begins when it appears..."; \
	fi; \
	echo "📜 Tailing $$LOG (Ctrl-C to stop)"; \
	tail -n 200 -F "$$LOG"

# Sandboxed Mac App Store (MAS) build: macOS redirects ~/Library/Logs into the
# app's sandbox container at ~/Library/Containers/<bundle-id>/Data. electron-log
# uses app.getName() for the subfolder, which resolves to the package.json
# "name" (smartloop-studio) even in the packaged build. Same tail -F behavior
# as logs-dev, just for the installed store app.
LOG_MAS_CONTAINER=ai.smartloop.studio

logs-mac:
	@LOG="$(HOME)/Library/Containers/$(LOG_MAS_CONTAINER)/Data/Library/Logs/$(LOG_APP_NAME)/main.log"; \
	if [ ! -f "$$LOG" ]; then \
		echo "⚠️  Log not created yet: $$LOG"; \
		echo "   Start the Mac App Store app — tailing begins when it appears..."; \
	fi; \
	echo "📜 Tailing $$LOG (Ctrl-C to stop)"; \
	tail -n 200 -F "$$LOG"

LOG_SLP_DIR=$(HOME)/.smartloop

# Tail the SLP backend service log live. The backend writes to <SLP_HOME>/server.log
# via a RotatingFileHandler; `tail -F` follows across rotation. Run alongside `make electron-dev`.
logs-slp:
	@LOG="$(LOG_SLP_DIR)/server.log"; \
	if [ ! -f "$$LOG" ]; then \
		echo "⚠️  Log not created yet: $$LOG"; \
		echo "   Start the app (make electron-dev) — tailing begins when it appears..."; \
	fi; \
	echo "📜 Tailing $$LOG (Ctrl-C to stop)"; \
	tail -n 200 -F "$$LOG"

LOG_MAS_SLP_DIR=$(HOME)/Library/Containers/$(LOG_MAS_CONTAINER)/Data/Library/Application Support/$(LOG_APP_NAME)/slp

# Sandboxed MAS build: the SLP backend runs with its home dir relocated into the
# sandbox container (see electron/main.js), so server.log lives under the slp dir.
logs-slp-mac:
	@LOG="$(LOG_MAS_SLP_DIR)/server.log"; \
	if [ ! -f "$$LOG" ]; then \
		echo "⚠️  Log not created yet: $$LOG"; \
		echo "   Start the Mac App Store app — tailing begins when it appears..."; \
	fi; \
	echo "📜 Tailing $$LOG (Ctrl-C to stop)"; \
	tail -n 200 -F "$$LOG"

# Quick rebuild without cleaning (faster for iterating)
rebuild-electron:
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "📱 Packaging Electron app..."
	npm run electron-pack-linux

# #####################################################################
# Docker Build & Push Targets
#
# These are for building and pushing Docker images
# #####################################################################

all: build-prod

init:
	chmod +x build.sh

build-prod: init
	./build.sh $(PROD_PROJECT_ID) app ${REGISTRY}

build-dev: init
	./build.sh $(DEV_PROJECT_ID) app ${REGISTRY}

rollout-dev: switch-to-dev build-dev
	kubectl rollout restart deployment/app -n dev

rollout-prod: switch-to-prod build-prod
	kubectl rollout restart deployment/app -n prod

# #####################################################################
# Kubectl Context Switching Targets
#
# These switch the current context to the dev or prod cluster
# #####################################################################

# Switch to dev cluster context
switch-to-dev:
	gcloud container clusters get-credentials $(call get_cluster_name,$(DEV_PROJECT_ID)) \
		--region=$(DEV_CLUSTER_REGION) --project=$(DEV_PROJECT_ID)

# Switch to prod cluster context
switch-to-prod:
	gcloud container clusters get-credentials $(call get_cluster_name,$(PROD_PROJECT_ID)) \
		--region=$(PROD_CLUSTER_REGION) --project=$(PROD_PROJECT_ID)

# #####################################################################
# Helm Deployment Targets
#
# These are for deploying the helm chart to the dev or prod cluster
# with the generated secrets and then rolling out the new deployment
# if the "and-rollout" targets are used, the deployment will be rolled out
# #####################################################################

# Deploy to dev with generated secrets
deploy-dev: switch-to-dev
	helm upgrade --install app helm/app \
		-f helm/app/values-dev.yaml \
		--namespace default

# Deploy to dev and force rollout (for when deploying new application code)
deploy-and-rollout-dev: deploy-dev rollout-dev

# Deploy to prod with generated secrets
deploy-prod: switch-to-prod
	helm upgrade --install app helm/app \
		-f helm/app/values-prod.yaml \
		--namespace default

# Deploy to prod and force rollout (for when deploying new application code)
deploy-and-rollout-prod: deploy-prod rollout-prod

# #####################################################################
# Undeploy/Destroy Targets
#
# These are for completely removing the deployment from the cluster
# to start fresh or clean up resources
# #####################################################################

# Undeploy from dev cluster
undeploy-dev: switch-to-dev
	@echo ""
	@echo "⚠️  WARNING: This will completely remove the 'app' deployment from the DEV cluster! ⚠️"
	@echo ""
	@read -p "Are you sure you want to continue? (y/N): " confirm && \
		if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
			helm uninstall app -n dev || true; \
		else \
			echo "Deployment removal cancelled."; \
			exit 1; \
		fi

# Undeploy from prod cluster
undeploy-prod: switch-to-prod
	@echo ""
	@echo "🚨 WARNING: This will completely remove the 'app' deployment from the PRODUCTION cluster! 🚨"
	@echo ""
	@read -p "Are you sure you want to continue? (y/N): " confirm && \
		if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
			helm uninstall app -n prod || true; \
		else \
			echo "Deployment removal cancelled."; \
			exit 1; \
		fi
