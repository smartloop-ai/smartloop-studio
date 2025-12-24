#!/bin/bash

echo "🧹 Cleaning previous builds..."
rm -rf dist dist-web

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building Vite app..."
npm run build

echo "📱 Packaging Electron app..."
npm run electron-pack-linux

echo "✅ Done! Your app is in the dist/ folder"
echo ""
echo "To run the app:"
echo "  ./dist/SmartLoop\\ Studio-0.1.0.AppImage"
echo ""
echo "Or install the .deb package:"
echo "  sudo dpkg -i dist/smartloop-ui-web_0.1.0_amd64.deb"

