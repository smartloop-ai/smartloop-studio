#!/bin/bash

echo "🚀 SmartLoop Studio - Vite Migration Test Script"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Clean
echo "🧹 Step 1/5: Cleaning previous builds..."
rm -rf node_modules dist dist-web .next
echo -e "${GREEN}✓ Clean complete${NC}"
echo ""

# Step 2: Install
echo "📦 Step 2/5: Installing dependencies..."
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
fi
echo ""

# Step 3: Build Vite
echo "🔨 Step 3/5: Building Vite app..."
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Vite build successful${NC}"
    echo "   Output: dist-web/"
    ls -lh dist-web/ | grep -E "index.html|assets"
else
    echo -e "${RED}✗ Vite build failed${NC}"
    exit 1
fi
echo ""

# Step 4: Package Electron
echo "📱 Step 4/5: Packaging Electron app..."
npm run electron-pack-linux
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Electron packaging successful${NC}"
    echo "   Output: dist/"
    ls -lh dist/*.AppImage 2>/dev/null || ls -lh dist/*.deb 2>/dev/null
else
    echo -e "${RED}✗ Electron packaging failed${NC}"
    exit 1
fi
echo ""

# Step 5: Verify
echo "✅ Step 5/5: Verification..."
echo ""

if [ -f "dist-web/index.html" ]; then
    echo -e "${GREEN}✓${NC} Vite build exists: dist-web/index.html"
else
    echo -e "${RED}✗${NC} Vite build missing"
fi

if [ -f "dist/SmartLoop Studio-0.1.0.AppImage" ]; then
    echo -e "${GREEN}✓${NC} AppImage exists"
    echo "  Size: $(du -h 'dist/SmartLoop Studio-0.1.0.AppImage' | cut -f1)"
elif [ -f "dist/smartloop-ui-web_0.1.0_amd64.deb" ]; then
    echo -e "${GREEN}✓${NC} DEB package exists"
    echo "  Size: $(du -h 'dist/smartloop-ui-web_0.1.0_amd64.deb' | cut -f1)"
else
    echo -e "${RED}✗${NC} No Electron package found"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}🎉 Migration test complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Test dev mode:    npm run electron-dev"
echo "  2. Run packaged app: ./dist/SmartLoop\\ Studio-0.1.0.AppImage"
echo "  3. Convert remaining pages (see MIGRATION_GUIDE.md)"
echo ""
echo "Documentation:"
echo "  - VITE_MIGRATION_COMPLETE.md  (overview)"
echo "  - MIGRATION_GUIDE.md           (detailed guide)"
echo "  - QUICK_REFERENCE.md           (cheat sheet)"
echo ""

