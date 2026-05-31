# App service Makefile - Build Docker images, sync secrets, deploy Helm charts, and manage cluster rollouts
BUILD_DIR=bin

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
	@echo "  make build-electron-windows  - Build Electron app for Windows (NSIS, portable)"
	@echo "  make build-electron-mac      - Build Electron app for macOS (DMG, zip)"
	@echo "  make build-electron          - Build Electron app for current platform"
	@echo ""
	@echo "  make stop                    - Stop the running SLP service"
	@echo "  make rebuild-electron        - Quick rebuild (skips npm install)"
	@echo "  make run-electron-dev        - Run Electron app in development mode"
	@echo "  make clean-electron          - Clean build artifacts"
	@echo ""
	@echo ""

# End-to-end test: clean install, start, and run the full first-launch flow
test: stop
	@echo "🧹 Cleaning ~/.smartloop for fresh install..."
	@rm -rf $(HOME)/.smartloop
	@echo "✅ Clean slate ready"
	@$(MAKE) run-electron-dev

# SLP version (must match VERSION in electron/slp-setup.js)
SLP_VERSION=1.0.24
SLP_BASE_URL=https://dl.smartloop.ai/slp/$(SLP_VERSION)
SLP_DATA_DIR=electron/data/slp/$(SLP_VERSION)

# Download the SLP binary for the current platform into electron/data/slp/<version>/
fetch-slp:
	@set -e; \
	if [ -s "$(SLP_DATA_DIR)/slp" ] || [ -s "$(SLP_DATA_DIR)/slp.exe" ]; then \
		echo "✅ SLP binary v$(SLP_VERSION) already present at $(SLP_DATA_DIR)/, skipping download"; \
	else \
		echo "📥 Fetching SLP binary v$(SLP_VERSION) for bundling..."; \
		rm -rf $(SLP_DATA_DIR); \
		mkdir -p $(SLP_DATA_DIR); \
		TMPDIR=$$(mktemp -d "$(SLP_DATA_DIR)/.fetch-tmp.XXXXXX"); \
		trap 'rm -rf "$$TMPDIR"' EXIT; \
		UNAME_S=$$(uname -s); \
		if echo "$$UNAME_S" | grep -qi "darwin"; then \
			PLAT=darwin; ARCH=arm64; EXT=tar.gz; BIN=slp; \
		elif echo "$$UNAME_S" | grep -qi "linux"; then \
			PLAT=linux; ARCH=amd64; EXT=tar.gz; BIN=slp; \
		else \
			PLAT=windows; ARCH=amd64; EXT=zip; BIN=slp.exe; \
		fi; \
		ARCHIVE="$$PLAT-$$ARCH-slp.$$EXT"; \
		URL="$(SLP_BASE_URL)/$$ARCHIVE"; \
		echo "  Downloading $$URL ..."; \
		curl -fSL "$$URL" -o "$$TMPDIR/$$ARCHIVE"; \
		echo "  Extracting to $(SLP_DATA_DIR)/ ..."; \
		EXTRACT="$$TMPDIR/extract"; \
		mkdir -p "$$EXTRACT"; \
		if [ "$$EXT" = "zip" ]; then \
			unzip -o "$$TMPDIR/$$ARCHIVE" -d "$$EXTRACT"; \
		else \
			tar -xzf "$$TMPDIR/$$ARCHIVE" -C "$$EXTRACT"; \
		fi; \
		if [ -d "$$EXTRACT/slp" ]; then \
			cp -R "$$EXTRACT/slp/"* $(SLP_DATA_DIR)/; \
		else \
			cp -R "$$EXTRACT/"* $(SLP_DATA_DIR)/; \
		fi; \
		if [ ! -s "$(SLP_DATA_DIR)/$$BIN" ]; then \
			rm -rf $(SLP_DATA_DIR); \
			echo "❌ Staged SLP binary $$BIN is missing or empty — aborting (bad download/extract from $$URL)"; \
			exit 1; \
		fi; \
		echo "✅ SLP binary staged at $(SLP_DATA_DIR)/ ($$(du -h "$(SLP_DATA_DIR)/$$BIN" | cut -f1))"; \
	fi

# Clean electron build artifacts
clean-electron:
	@echo "🧹 Cleaning Electron build artifacts..."
	rm -rf dist dist-web

# Stop the running SLP service
stop:
	@echo "🛑 Stopping SLP service..."
	@if [ -f "$(HOME)/.smartloop/1.0.1/slp" ]; then \
		$(HOME)/.smartloop/1.0.1/slp server stop 2>/dev/null && echo "✅ SLP service stopped" || echo "⚠️  SLP service was not running"; \
	else \
		echo "⚠️  SLP binary not found at ~/.smartloop/1.0.1/slp"; \
	fi

# Build Electron app for current platform
build-electron: clean-electron fetch-slp
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "📱 Packaging Electron app..."
	npm run electron-pack

# Build Electron app for Linux
build-electron-linux: clean-electron fetch-slp
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "🐧 Packaging Electron app for Linux..."
	npm run electron-pack-linux
	@echo "✅ Done! Your app is in the dist/ folder"

# Build Electron app for Windows
build-electron-windows: clean-electron fetch-slp
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "🪟 Packaging Electron app for Windows..."
	npm run electron-pack-win
	@echo "✅ Done! Your app is in the dist/ folder"

# Build Electron app for macOS
build-electron-mac: clean-electron fetch-slp
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🔨 Building Vite app..."
	npm run build
	@echo "🍎 Packaging Electron app for macOS..."
	npm run electron-pack-mac
	@echo "✅ Done! Your app is in the dist/ folder"

# Run Electron app in development mode
run-electron-dev: fetch-slp
	@echo "🚀 Starting Electron app in development mode..."
	npm run electron-dev

# Alias for run-electron-dev
electron-dev: run-electron-dev

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
