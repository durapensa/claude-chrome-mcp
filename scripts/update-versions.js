#!/usr/bin/env node
/**
 * Update all version references to match VERSION file
 * Ensures consistency across package.json files and hardcoded versions
 */

const fs = require('fs');
const path = require('path');
const { getVersion } = require('./get-version');

const version = getVersion();
console.log(`Updating all version references to: ${version}`);

// Update package.json files
const packageFiles = [
  'package.json',
  'mcp-server/package.json', 
  'cli/package.json'
];

packageFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`✅ Updated ${file}`);
  }
});

// Update extension manifest.json
const manifestPath = path.join(__dirname, '../extension/manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✅ Updated extension/manifest.json`);
}

// Update hardcoded versions in JavaScript files
const jsFiles = [
  'mcp-server/src/server.js',
  'mcp-server/src/hub/websocket-hub.js'
];

jsFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace version strings in various patterns
    content = content.replace(/version:\s*['"`][\d.]+['"`]/g, `version: '${version}'`);
    content = content.replace(/version['"`]:\s*['"`][\d.]+['"`]/g, `version: '${version}'`);
    
    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated ${file}`);
  }
});

console.log(`\n🎉 All version references updated to ${version}`);