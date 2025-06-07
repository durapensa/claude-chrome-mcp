/**
 * Central configuration for MCP Server
 * 
 * All configuration values are set here with environment variable overrides.
 * This file should be required before any other modules to ensure consistent configuration.
 * 
 * Version Policy: Bump minor version frequently. Components should check versions
 * to quickly identify problems from version mismatches.
 */

const fs = require('fs');
const path = require('path');

// Try to load dotenv if available (optional dependency)
try {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
} catch (e) {
  // dotenv is optional - if not installed, we'll use process.env as-is
}

// If dotenv isn't available, try to load .env manually (simple parser)
try {
  const envPath = path.join(__dirname, '../../.env');
  if (!process.env.DOTENV_LOADED && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('='); // Handle values with = in them
        if (key && value && !process.env[key.trim()]) {
          process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        }
      }
    });
  }
} catch (e) {
  // .env file is optional - ignore errors
}

// Read version from central VERSION file
function getVersion() {
  try {
    const versionFile = path.join(__dirname, '../../VERSION');
    return fs.readFileSync(versionFile, 'utf8').trim();
  } catch (error) {
    console.error('Warning: Could not read VERSION file:', error.message);
    return '0.0.0'; // Fallback version
  }
}

// Central configuration with environment overrides
const config = {
  // Component version
  VERSION: getVersion(),
  COMPONENT_NAME: 'mcp-server',
  
  // Network settings
  WEBSOCKET_PORT: parseInt(process.env.MCP_WEBSOCKET_PORT || '54321', 10),
  CLAUDE_URL: process.env.MCP_CLAUDE_URL || 'https://claude.ai',
  CLAUDE_DOMAIN: process.env.MCP_CLAUDE_DOMAIN || 'claude.ai',
  
  // Timeouts (in milliseconds)
  OPERATION_TIMEOUT: parseInt(process.env.MCP_OPERATION_TIMEOUT || '180000', 10), // 3 minutes
  COMPLETION_TIMEOUT: parseInt(process.env.MCP_COMPLETION_TIMEOUT || '600000', 10), // 10 minutes
  KEEPALIVE_INTERVAL: parseInt(process.env.MCP_KEEPALIVE_INTERVAL || '20000', 10), // 20 seconds
  RECONNECT_INTERVAL: parseInt(process.env.MCP_RECONNECT_INTERVAL || '2000', 10), // 2 seconds
  DEFAULT_TIMEOUT: parseInt(process.env.MCP_DEFAULT_TIMEOUT || '30000', 10), // 30 seconds
  
  // Operational limits
  MAX_RETRIES: parseInt(process.env.MCP_MAX_RETRIES || '3', 10),
  RETRY_DELAY_MS: parseInt(process.env.MCP_RETRY_DELAY_MS || '1000', 10),
  BATCH_SIZE: parseInt(process.env.MCP_BATCH_SIZE || '50', 10),
  MAX_CONCURRENT: parseInt(process.env.MCP_MAX_CONCURRENT || '5', 10),
  
  // Max reconnect delay for relay client
  MAX_RECONNECT_DELAY: parseInt(process.env.MCP_MAX_RECONNECT_DELAY || '30000', 10),
  
  // Debug settings
  DEBUG_MODE: process.env.MCP_DEBUG_MODE === 'true',
  LOG_LEVEL: process.env.MCP_LOG_LEVEL || 'info',
  
  // Feature flags
  ENABLE_HEALTH_CHECK: process.env.MCP_ENABLE_HEALTH_CHECK !== 'false', // Default true
  
  // Version checking utilities
  parseVersion(version) {
    const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
    return { major, minor, patch };
  },
  
  compareVersions(v1, v2) {
    const parts1 = this.parseVersion(v1);
    const parts2 = this.parseVersion(v2);
    
    if (parts1.major !== parts2.major) return parts1.major - parts2.major;
    if (parts1.minor !== parts2.minor) return parts1.minor - parts2.minor;
    return parts1.patch - parts2.patch;
  },
  
  isVersionCompatible(otherVersion, options = {}) {
    const { requireExact = false, requireMinor = false } = options;
    
    if (!otherVersion) return false;
    
    const current = this.parseVersion(this.VERSION);
    const other = this.parseVersion(otherVersion);
    
    if (requireExact) {
      return this.VERSION === otherVersion;
    }
    
    if (requireMinor) {
      // Require same major and minor version
      return current.major === other.major && current.minor === other.minor;
    }
    
    // Default: just check major version compatibility
    return current.major === other.major;
  },
  
  // Version mismatch message helper
  getVersionMismatchMessage(componentName, theirVersion) {
    const current = this.parseVersion(this.VERSION);
    const other = this.parseVersion(theirVersion);
    
    if (current.major !== other.major) {
      return `Major version mismatch with ${componentName}: ${this.VERSION} vs ${theirVersion}. Please update all components.`;
    } else if (current.minor !== other.minor) {
      return `Minor version difference with ${componentName}: ${this.VERSION} vs ${theirVersion}. Consider updating for best compatibility.`;
    } else {
      return `Patch version difference with ${componentName}: ${this.VERSION} vs ${theirVersion}. Should be compatible.`;
    }
  },
  
  // Helper to get all config as object (useful for debugging)
  toObject() {
    const obj = {};
    for (const [key, value] of Object.entries(this)) {
      if (typeof value !== 'function') {
        obj[key] = value;
      }
    }
    return obj;
  }
};

// Log config on startup if debug mode
if (config.DEBUG_MODE) {
  console.log('MCP Server Config loaded:', {
    version: config.VERSION,
    websocketPort: config.WEBSOCKET_PORT,
    environment: process.env.NODE_ENV || 'production'
  });
}

// Freeze config to prevent accidental mutations
module.exports = Object.freeze(config);