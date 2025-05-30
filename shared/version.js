/**
 * Version management for Claude Chrome MCP components
 * 
 * All components should report their version for debugging
 */

const fs = require('fs');
const path = require('path');

// Read version from VERSION file
const VERSION = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf-8').trim();

// Component versions - increment when making breaking changes
const COMPONENT_VERSIONS = {
  core: VERSION,
  extension: '2.3.0',
  mcp_server: '2.3.0',
  hub: '1.2.0',
  protocols: '1.1.0',
  tab_pool: '1.0.0'
};

// Build metadata
const BUILD_INFO = {
  version: VERSION,
  components: COMPONENT_VERSIONS,
  buildTime: new Date().toISOString(),
  nodeVersion: process.version,
  platform: process.platform
};

/**
 * Get version string for a component
 */
function getVersion(component = 'core') {
  return COMPONENT_VERSIONS[component] || VERSION;
}

/**
 * Get full version info for debugging
 */
function getVersionInfo() {
  return {
    ...BUILD_INFO,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid
  };
}

/**
 * Format version for display
 */
function formatVersion(component = 'core') {
  const v = getVersion(component);
  return `v${v}`;
}

/**
 * Check version compatibility
 */
function checkCompatibility(clientVersion, serverVersion) {
  const [clientMajor] = clientVersion.split('.');
  const [serverMajor] = serverVersion.split('.');
  
  // Major version must match
  return clientMajor === serverMajor;
}

module.exports = {
  VERSION,
  COMPONENT_VERSIONS,
  BUILD_INFO,
  getVersion,
  getVersionInfo,
  formatVersion,
  checkCompatibility
};