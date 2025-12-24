#!/bin/bash

# Script to fix Next.js imports in all remaining components and pages

echo "🔧 Fixing Next.js imports across the codebase..."
echo ""

# Function to update a file
update_file() {
    local file=$1
    echo "  📝 Updating: $file"
    
    # Remove 'use client' directive
    sed -i "/^'use client';$/d" "$file"
    sed -i '/^"use client";$/d' "$file"
    
    # Replace Next.js navigation imports with React Router
    sed -i "s/import { useRouter } from 'next\/navigation'/import { useNavigate } from 'react-router-dom'/g" "$file"
    sed -i 's/import { useRouter } from "next\/navigation"/import { useNavigate } from "react-router-dom"/g' "$file"
    
    sed -i "s/import { usePathname } from 'next\/navigation'/import { useLocation } from 'react-router-dom'/g" "$file"
    sed -i 's/import { usePathname } from "next\/navigation"/import { useLocation } from "react-router-dom"/g' "$file"
    
    sed -i "s/import { useRouter, usePathname } from 'next\/navigation'/import { useNavigate, useLocation } from 'react-router-dom'/g" "$file"
    sed -i 's/import { useRouter, usePathname } from "next\/navigation"/import { useNavigate, useLocation } from "react-router-dom"/g' "$file"
    
    # Remove Next.js Image imports
    sed -i "/import Image from 'next\/image'/d" "$file"
    sed -i '/import Image from "next\/image"/d' "$file"
    
    # Add pathname extraction from location if usePathname was used
    if grep -q "useLocation" "$file" && ! grep -q "const pathname = location.pathname" "$file"; then
        # This is a simple approach - may need manual review
        :
    fi
}

# Update all component files
for file in src/app/components/*.tsx; do
    if [ -f "$file" ]; then
        update_file "$file"
    fi
done

# Update hooks
for file in src/app/hooks/*.ts src/app/hooks/*.tsx; do
    if [ -f "$file" ]; then
        update_file "$file"
    fi
done

echo ""
echo "✅ Done! Next steps:"
echo "  1. Manually review changed files"
echo "  2. Replace 'const router = useRouter()' with 'const navigate = useNavigate()'"
echo "  3. Replace 'const pathname = usePathname()' with 'const location = useLocation(); const pathname = location.pathname'"
echo "  4. Replace 'router.push()' calls with 'navigate()'"
echo "  5. Replace 'router.back()' with 'navigate(-1)'"
echo "  6. Replace Next.js <Image> components with <img> tags"
echo ""

