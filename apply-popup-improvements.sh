#!/bin/bash

# Script to apply popup UI improvements

echo "🎨 Applying popup UI improvements..."

# Create backup directory
BACKUP_DIR="extension/popup-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup current files
echo "📦 Backing up current popup files to $BACKUP_DIR..."
cp extension/popup.html "$BACKUP_DIR/"
cp extension/popup.js "$BACKUP_DIR/"

# Apply improvements
echo "✨ Applying improved popup files..."
cp extension/popup-improved.html extension/popup.html
cp extension/popup-improved.js extension/popup.js

echo "✅ Popup UI improvements applied!"
echo ""
echo "To revert changes, run:"
echo "  cp $BACKUP_DIR/popup.html extension/"
echo "  cp $BACKUP_DIR/popup.js extension/"
echo ""
echo "⚠️  Remember to reload the extension in Chrome after making changes."