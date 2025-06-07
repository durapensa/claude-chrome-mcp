#!/usr/bin/env node
/**
 * Validate configuration consistency across all components
 */

const fs = require('fs');
const path = require('path');

// Read VERSION file
const versionFile = path.join(__dirname, '../VERSION');
const expectedVersion = fs.readFileSync(versionFile, 'utf8').trim();

console.log(`Expected version from VERSION file: ${expectedVersion}`);
console.log('Checking configuration consistency...\n');

// Check package.json files
const packageFiles = [
  '../package.json',
  '../mcp-server/package.json',
  '../cli/package.json'
];

let allValid = true;

packageFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const matches = pkg.version === expectedVersion;
    console.log(`✓ ${file}: ${pkg.version} ${matches ? '✅' : '❌'}`);
    if (!matches) allValid = false;
  }
});

// Check extension manifest
const manifestPath = path.join(__dirname, '../extension/manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const matches = manifest.version === expectedVersion;
  console.log(`✓ extension/manifest.json: ${manifest.version} ${matches ? '✅' : '❌'}`);
  if (!matches) allValid = false;
}

// Check hardcoded values
console.log('\nChecking hardcoded values...');

// Check offscreen.js for any remaining hardcoded versions
const offscreenPath = path.join(__dirname, '../extension/offscreen.js');
const offscreenContent = fs.readFileSync(offscreenPath, 'utf8');
const hardcodedVersionMatch = offscreenContent.match(/VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
if (hardcodedVersionMatch) {
  const version = hardcodedVersionMatch[1];
  if (version === '0.0.0') {
    console.log(`✓ extension/offscreen.js: Default version ${version} (dynamically updated) ✅`);
  } else {
    console.log(`⚠️  extension/offscreen.js has hardcoded version: ${version}`);
    allValid = false;
  }
} else {
  console.log(`✓ extension/offscreen.js: No hardcoded version ✅`);
}

// Check shared config values
console.log('\nChecking shared configuration values...');

const configs = {
  'mcp-server/src/config.js': null,
  'cli/src/config/defaults.ts': null,
  'extension/modules/config.js': null
};

// Load MCP server config
try {
  const serverConfig = require('../mcp-server/src/config.js');
  configs['mcp-server/src/config.js'] = {
    WEBSOCKET_PORT: serverConfig.WEBSOCKET_PORT,
    VERSION: serverConfig.VERSION
  };
} catch (e) {
  console.error('Failed to load mcp-server config:', e.message);
}

// Check TypeScript CLI config
const cliConfigPath = path.join(__dirname, '../cli/src/config/defaults.ts');
const cliContent = fs.readFileSync(cliConfigPath, 'utf8');
const portMatch = cliContent.match(/WEBSOCKET_PORT.*?(\d+)/);
if (portMatch) {
  configs['cli/src/config/defaults.ts'] = {
    WEBSOCKET_PORT: parseInt(portMatch[1])
  };
}

// Check extension config
const extConfigPath = path.join(__dirname, '../extension/modules/config.js');
const extContent = fs.readFileSync(extConfigPath, 'utf8');
const extPortMatch = extContent.match(/WEBSOCKET_PORT\s*=\s*(\d+)/);
if (extPortMatch) {
  configs['extension/modules/config.js'] = {
    WEBSOCKET_PORT: parseInt(extPortMatch[1])
  };
}

// Compare WebSocket ports
const ports = Object.entries(configs)
  .filter(([_, config]) => config && config.WEBSOCKET_PORT)
  .map(([file, config]) => ({ file, port: config.WEBSOCKET_PORT }));

if (ports.length > 0) {
  const firstPort = ports[0].port;
  const allPortsMatch = ports.every(p => p.port === firstPort);
  
  console.log(`\nWebSocket Port Consistency: ${allPortsMatch ? '✅' : '❌'}`);
  ports.forEach(({ file, port }) => {
    console.log(`  ${file}: ${port}`);
  });
  
  if (!allPortsMatch) allValid = false;
}

// Summary
console.log(`\n${allValid ? '✅ All configurations are consistent!' : '❌ Configuration inconsistencies found!'}`);

if (!allValid) {
  console.log('\nTo fix inconsistencies, run: npm run update-versions');
  process.exit(1);
}