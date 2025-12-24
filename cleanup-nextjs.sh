#!/bin/bash

echo "🧹 Removing all Next.js references from the project..."
echo ""

# Remove Next.js config files
echo "📝 Removing Next.js config files..."
rm -f next.config.mjs
rm -f next-env.d.ts
echo "  ✓ Removed next.config.mjs"
echo "  ✓ Removed next-env.d.ts"
echo ""

# Remove old Next.js page structure (but keep CSS files we might need)
echo "📁 Removing old Next.js page files..."

# Remove old page.tsx files (not in pages/ directory)
find src/app -type f -name "page.tsx" ! -path "*/pages/*" -delete
echo "  ✓ Removed old page.tsx files"

# Remove layout.tsx (Next.js specific)
rm -f src/app/layout.tsx
echo "  ✓ Removed layout.tsx"

# Remove old directories that are now empty or unused
echo ""
echo "📂 Cleaning up old directories..."

# List of old Next.js route directories to remove
OLD_DIRS=(
  "src/app/documents"
  "src/app/oauth-callback"
  "src/app/profile"
  "src/app/project/[slug]"
  "src/app/project"
  "src/app/forgot"
  "src/app/verify"
  "src/app/settings"
  "src/app/projects"
  "src/app/terms"
  "src/app/developer"
  "src/app/reset"
  "src/app/resend"
  "src/app/invite"
  "src/app/login"
  "src/app/signup"
  "src/app/pricing"
)

for dir in "${OLD_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    rm -rf "$dir"
    echo "  ✓ Removed $dir"
  fi
done

# Remove the root page.tsx and page.css
rm -f src/app/page.tsx
rm -f src/app/page.css
echo "  ✓ Removed src/app/page.tsx and page.css"

echo ""
echo "✨ Cleanup complete!"
echo ""
echo "Summary:"
echo "  • Removed Next.js config files"
echo "  • Removed old page.tsx structure"
echo "  • Removed layout.tsx"
echo "  • Cleaned up old route directories"
echo ""
echo "Your app now uses:"
echo "  ✓ Vite (vite.config.ts)"
echo "  ✓ React Router (src/App.tsx)"
echo "  ✓ New pages structure (src/app/pages/)"
echo ""

