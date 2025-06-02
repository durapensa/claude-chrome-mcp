#!/bin/bash

# Build script for Chrome Extension

echo "Building Chrome Extension..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Clean dist directory
echo "Cleaning dist directory..."
rm -rf dist
mkdir -p dist

# For now, copy files directly (until webpack is set up)
echo "Copying extension files..."
cp manifest.json dist/
cp popup.html dist/
cp popup.js dist/

# Copy the modular background script as a temporary solution
cp background-modular.js dist/background.js

echo "Build complete! Load the extension from the 'dist' directory."
echo ""
echo "To use webpack bundling (recommended):"
echo "1. npm install"
echo "2. npm run build"