#!/usr/bin/env node

/**
 * Quick verification script to run after restart
 */

const fs = require('fs');
const path = require('path');
const { VERSION, getVersionInfo } = require('./version');

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`${colors.blue}🔍 Claude Chrome MCP Setup Verification${colors.reset}`);
console.log('=' .repeat(50));

// 1. Check versions
console.log(`\n${colors.cyan}📋 Version Information${colors.reset}`);
const versionInfo = getVersionInfo();
console.log(`Core Version: ${colors.green}v${versionInfo.version}${colors.reset}`);
console.log('Component Versions:');
Object.entries(versionInfo.components).forEach(([component, version]) => {
  console.log(`  - ${component}: v${version}`);
});

// 2. Check critical files
console.log(`\n${colors.cyan}📁 Critical Files${colors.reset}`);
const criticalFiles = [
  '/development/CURRENT_STATE.md',
  '/docs/TROUBLESHOOTING.md',
  '/shared/check-hub-status.js',
  '/extension/manifest.json',
  '/mcp-server/src/server.js',
  '/shared/version.js'
];

criticalFiles.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  const exists = fs.existsSync(fullPath);
  console.log(`${exists ? colors.green + '✓' : colors.red + '✗'} ${file}${colors.reset}`);
});

// 3. Check for fixes to apply
console.log(`\n${colors.cyan}🔧 Fixes to Apply${colors.reset}`);
const fixes = [
  { file: '/extension/popup-hub-fix.js', target: 'popup.js', status: 'Created, not applied' },
  { file: '/extension/background-hub-fix.js', target: 'background.js', status: 'Created, not applied' },
  { file: '/mcp-server/src/server-hub-fix.js', target: 'server.js', status: 'Created, not applied' }
];

fixes.forEach(fix => {
  console.log(`${colors.yellow}⚠${colors.reset}  ${fix.file} → ${fix.target}`);
  console.log(`   Status: ${fix.status}`);
});

// 4. Environment recommendations
console.log(`\n${colors.cyan}🌍 Environment Setup${colors.reset}`);
console.log('Add to Claude Code environment or .env:');
console.log(`${colors.green}CCM_FORCE_HUB_CREATION=1${colors.reset}`);
console.log(`${colors.green}CCM_DEBUG=1${colors.reset} (optional, for debugging)`);

// 5. Quick commands
console.log(`\n${colors.cyan}🚀 Quick Commands${colors.reset}`);
console.log('Check hub status:');
console.log(`  ${colors.yellow}node shared/check-hub-status.js${colors.reset}`);
console.log('\nForce start hub:');
console.log(`  ${colors.yellow}CCM_FORCE_HUB_CREATION=1 node mcp-server/src/server.js${colors.reset}`);
console.log('\nCheck Chrome extension:');
console.log(`  1. Go to ${colors.blue}chrome://extensions${colors.reset}`);
console.log(`  2. Find "Claude Chrome MCP"`);
console.log(`  3. Version should be ${colors.green}2.3.0${colors.reset}`);
console.log(`  4. Click "Reload" to apply updates`);

// 6. Next steps
console.log(`\n${colors.cyan}📝 Next Steps After Restart${colors.reset}`);
console.log('1. Run this script again to verify');
console.log('2. Check hub status with diagnostic script');
console.log('3. Open extension popup - should connect');
console.log(`4. If hub not running, see ${colors.yellow}/development/CURRENT_STATE.md${colors.reset}`);

console.log('\n' + '=' .repeat(50));
console.log(`${colors.blue}✨ Verification Complete${colors.reset}`);

// Check if we're in Claude Code
if (process.env.ANTHROPIC_ENVIRONMENT === 'claude_code') {
  console.log(`\n${colors.green}✓ Running in Claude Code environment${colors.reset}`);
} else {
  console.log(`\n${colors.yellow}⚠ Not running in Claude Code environment${colors.reset}`);
}