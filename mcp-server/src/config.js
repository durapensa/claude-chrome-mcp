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
const os = require('os');

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
  HEALTH_PORT: parseInt(process.env.MCP_HEALTH_PORT || '54322', 10),
  RELAY_HOST: process.env.MCP_RELAY_HOST || '127.0.0.1',
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
  OPERATION_CLEANUP_AGE: parseInt(process.env.MCP_OPERATION_CLEANUP_AGE || '3600000', 10), // 1 hour
  
  // Max reconnect delay for relay client
  MAX_RECONNECT_DELAY: parseInt(process.env.MCP_MAX_RECONNECT_DELAY || '30000', 10),
  
  // Tool operation defaults
  POLL_INTERVAL_MS: parseInt(process.env.MCP_POLL_INTERVAL || '1000', 10),
  SEQUENTIAL_DELAY_MS: parseInt(process.env.MCP_SEQUENTIAL_DELAY || '1000', 10),
  API_BATCH_SIZE: parseInt(process.env.MCP_API_BATCH_SIZE || '5', 10),
  GRACE_PERIOD_MS: parseInt(process.env.MCP_GRACE_PERIOD || '2000', 10),
  STALE_THRESHOLD_MS: parseInt(process.env.MCP_STALE_THRESHOLD || '300000', 10), // 5 minutes
  MAX_ELEMENTS_DEFAULT: parseInt(process.env.MCP_MAX_ELEMENTS_DEFAULT || '1000', 10),
  LOG_BATCH_INTERVAL_MS: parseInt(process.env.MCP_LOG_BATCH_INTERVAL || '2000', 10),
  
  // Request timeouts
  HEALTH_CHECK_TIMEOUT: parseInt(process.env.MCP_HEALTH_CHECK_TIMEOUT || '1000', 10),
  RELAY_REQUEST_TIMEOUT: parseInt(process.env.MCP_RELAY_REQUEST_TIMEOUT || '10000', 10),
  RELAY_CONNECTION_TIMEOUT: parseInt(process.env.MCP_RELAY_CONNECTION_TIMEOUT || '10000', 10),
  
  // Environment variable consolidation
  CLIENT_NAME_OVERRIDE: process.env.CCM_CLIENT_NAME || null,
  VERBOSE_MODE: process.env.CCM_VERBOSE === '1',
  
  // File system paths
  LOG_DIR: process.env.MCP_LOG_DIR || path.join(os.homedir(), '.claude-chrome-mcp', 'logs'),
  
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

// Add URL Templates after config is defined (to avoid circular reference)
config.CLAUDE_URLS = {
  // SAFE/STABLE URLs - User-facing, unlikely to change
  base() { return config.CLAUDE_URL; },
  newConversation() { return `${config.CLAUDE_URL}/new`; },
  conversation(conversationId) { return `${config.CLAUDE_URL}/chat/${conversationId}`; },
  
  // RISKY/INTERNAL URLs - API endpoints, may change without notice
  // These are internal Claude.ai API patterns observed through network monitoring
  // CAUTION: These may break if Claude.ai changes their internal API structure
  apiConversations(orgId) { return `${config.CLAUDE_URL}/api/organizations/${orgId}/chat_conversations`; },
  apiConversation(orgId, conversationId) { return `${config.CLAUDE_URL}/api/organizations/${orgId}/chat_conversations/${conversationId}`; },
  apiCompletion(orgId, conversationId) { return `${config.CLAUDE_URL}/api/organizations/${orgId}/chat_conversations/${conversationId}/completion`; }
};

// Add Relay URL Templates
config.RELAY_URLS = {
  websocket() { return `ws://${config.RELAY_HOST}:${config.WEBSOCKET_PORT}`; },
  health() { return `http://${config.RELAY_HOST}:${config.HEALTH_PORT}/health`; },
  takeover() { return `http://${config.RELAY_HOST}:${config.HEALTH_PORT}/takeover`; }
};

// Log config on startup if debug mode
if (config.DEBUG_MODE) {
  console.log('MCP Server Config loaded:', {
    version: config.VERSION,
    websocketPort: config.WEBSOCKET_PORT,
    environment: process.env.NODE_ENV || 'production'
  });
}

// Freeze config to prevent accidental mutations (including the added CLAUDE_URLS)
module.exports = Object.freeze(config);