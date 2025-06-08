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

// ============================================
// CLAUDE.AI CONSTANTS
// ============================================

// Claude base values
const CLAUDE_BASE_URL = 'https://claude.ai';

// Claude path segments
const CHAT = '/chat';
const NEW = '/new';
const API = '/api';
const ORGANIZATIONS = '/organizations';
const CHAT_CONVERSATIONS = '/chat_conversations';
const COMPLETION = '/completion';

// Claude compound paths
const CLAUDE_API_PREFIX = `${API}${ORGANIZATIONS}`;

// Claude full paths
const CLAUDE_PATH_NEW = NEW;
const CLAUDE_PATH_CONVERSATION = `${CHAT}/{conversationId}`;
const CLAUDE_PATH_API_CONVERSATIONS = `${CLAUDE_API_PREFIX}/{orgId}${CHAT_CONVERSATIONS}`;
const CLAUDE_PATH_API_CONVERSATION = `${CLAUDE_API_PREFIX}/{orgId}${CHAT_CONVERSATIONS}/{conversationId}`;
const CLAUDE_PATH_API_COMPLETION = `${CLAUDE_API_PREFIX}/{orgId}${CHAT_CONVERSATIONS}/{conversationId}${COMPLETION}`;

// ============================================
// RELAY & INTERNAL CONSTANTS
// ============================================

// Relay base values
const RELAY_HOST_DEFAULT = '127.0.0.1';
const WEBSOCKET_PORT_DEFAULT = 54321;
const HEALTH_PORT_DEFAULT = 54322;

// Protocols
const WS_PROTOCOL = 'ws://';
const HTTP_PROTOCOL = 'http://';

// Relay paths
const HEALTH_PATH = '/health';
const TAKEOVER_PATH = '/takeover';

// ============================================
// TIMEOUT CONSTANTS (milliseconds)
// ============================================

const TIMEOUT_OPERATION = 180000;        // 3 minutes
const TIMEOUT_COMPLETION = 600000;       // 10 minutes
const TIMEOUT_DEFAULT = 30000;           // 30 seconds
const TIMEOUT_KEEPALIVE = 20000;         // 20 seconds
const TIMEOUT_RECONNECT = 2000;          // 2 seconds
const TIMEOUT_MAX_RECONNECT = 30000;     // 30 seconds
const TIMEOUT_HEALTH_CHECK = 1000;       // 1 second
const TIMEOUT_RELAY_REQUEST = 10000;     // 10 seconds
const TIMEOUT_RELAY_CONNECTION = 10000;  // 10 seconds
const TIMEOUT_GRACE_PERIOD = 2000;       // 2 seconds
const TIMEOUT_STALE_THRESHOLD = 300000;  // 5 minutes
const TIMEOUT_CLEANUP_AGE = 3600000;     // 1 hour

// ============================================
// OPERATIONAL CONSTANTS
// ============================================

const OP_MAX_RETRIES = 3;
const OP_RETRY_DELAY = 1000;
const OP_BATCH_SIZE = 50;
const OP_API_BATCH_SIZE = 5;
const OP_MAX_CONCURRENT = 5;
const OP_POLL_INTERVAL = 1000;
const OP_SEQUENTIAL_DELAY = 1000;
const OP_MAX_ELEMENTS = 1000;
const OP_LOG_BATCH_INTERVAL = 2000;

// ============================================
// ENVIRONMENT & VERSION SETUP
// ============================================

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

// ============================================
// RESOLVED CONFIGURATION VALUES
// All environment overrides resolved here
// ============================================

const VERSION = getVersion();
const COMPONENT_NAME = 'mcp-server';

// Network settings (resolved from env)
const WEBSOCKET_PORT = parseInt(process.env.MCP_WEBSOCKET_PORT || WEBSOCKET_PORT_DEFAULT, 10);
const HEALTH_PORT = parseInt(process.env.MCP_HEALTH_PORT || HEALTH_PORT_DEFAULT, 10);
const RELAY_HOST = process.env.MCP_RELAY_HOST || RELAY_HOST_DEFAULT;
const CLAUDE_URL = process.env.MCP_CLAUDE_URL || CLAUDE_BASE_URL;
const CLAUDE_DOMAIN = new URL(CLAUDE_URL).hostname;

// Timeouts (resolved from env)
const OPERATION_TIMEOUT = parseInt(process.env.MCP_OPERATION_TIMEOUT || TIMEOUT_OPERATION, 10);
const COMPLETION_TIMEOUT = parseInt(process.env.MCP_COMPLETION_TIMEOUT || TIMEOUT_COMPLETION, 10);
const KEEPALIVE_INTERVAL = parseInt(process.env.MCP_KEEPALIVE_INTERVAL || TIMEOUT_KEEPALIVE, 10);
const RECONNECT_INTERVAL = parseInt(process.env.MCP_RECONNECT_INTERVAL || TIMEOUT_RECONNECT, 10);
const DEFAULT_TIMEOUT = parseInt(process.env.MCP_DEFAULT_TIMEOUT || TIMEOUT_DEFAULT, 10);
const MAX_RECONNECT_DELAY = parseInt(process.env.MCP_MAX_RECONNECT_DELAY || TIMEOUT_MAX_RECONNECT, 10);
const HEALTH_CHECK_TIMEOUT = parseInt(process.env.MCP_HEALTH_CHECK_TIMEOUT || TIMEOUT_HEALTH_CHECK, 10);
const RELAY_REQUEST_TIMEOUT = parseInt(process.env.MCP_RELAY_REQUEST_TIMEOUT || TIMEOUT_RELAY_REQUEST, 10);
const RELAY_CONNECTION_TIMEOUT = parseInt(process.env.MCP_RELAY_CONNECTION_TIMEOUT || TIMEOUT_RELAY_CONNECTION, 10);
const GRACE_PERIOD_MS = parseInt(process.env.MCP_GRACE_PERIOD || TIMEOUT_GRACE_PERIOD, 10);
const STALE_THRESHOLD_MS = parseInt(process.env.MCP_STALE_THRESHOLD || TIMEOUT_STALE_THRESHOLD, 10);
const OPERATION_CLEANUP_AGE = parseInt(process.env.MCP_OPERATION_CLEANUP_AGE || TIMEOUT_CLEANUP_AGE, 10);

// Operations (resolved from env)
const MAX_RETRIES = parseInt(process.env.MCP_MAX_RETRIES || OP_MAX_RETRIES, 10);
const RETRY_DELAY_MS = parseInt(process.env.MCP_RETRY_DELAY_MS || OP_RETRY_DELAY, 10);
const BATCH_SIZE = parseInt(process.env.MCP_BATCH_SIZE || OP_BATCH_SIZE, 10);
const MAX_CONCURRENT = parseInt(process.env.MCP_MAX_CONCURRENT || OP_MAX_CONCURRENT, 10);
const POLL_INTERVAL_MS = parseInt(process.env.MCP_POLL_INTERVAL || OP_POLL_INTERVAL, 10);
const SEQUENTIAL_DELAY_MS = parseInt(process.env.MCP_SEQUENTIAL_DELAY || OP_SEQUENTIAL_DELAY, 10);
const API_BATCH_SIZE = parseInt(process.env.MCP_API_BATCH_SIZE || OP_API_BATCH_SIZE, 10);
const MAX_ELEMENTS_DEFAULT = parseInt(process.env.MCP_MAX_ELEMENTS_DEFAULT || OP_MAX_ELEMENTS, 10);
const LOG_BATCH_INTERVAL_MS = parseInt(process.env.MCP_LOG_BATCH_INTERVAL || OP_LOG_BATCH_INTERVAL, 10);

// Other settings
const CLIENT_NAME_OVERRIDE = process.env.CCM_CLIENT_NAME || null;
const VERBOSE_MODE = process.env.CCM_VERBOSE === '1';
const LOG_DIR = process.env.MCP_LOG_DIR || path.join(os.homedir(), '.claude-chrome-mcp', 'logs');
const DEBUG_MODE = process.env.MCP_DEBUG_MODE === 'true';
const LOG_LEVEL = process.env.MCP_LOG_LEVEL || 'info';
const ENABLE_HEALTH_CHECK = process.env.MCP_ENABLE_HEALTH_CHECK !== 'false';

// ============================================
// URL BUILDER HELPER
// ============================================

// Helper to replace path parameters
function buildPath(pathTemplate, params = {}) {
  let path = pathTemplate;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`{${key}}`, value);
  }
  return path;
}

// ============================================
// CLAUDE URL BUILDERS - Using resolved constants
// ============================================

const CLAUDE_URLS = {
  // SAFE/STABLE URLs - User-facing, unlikely to change
  base() { return CLAUDE_URL; },
  newConversation() { return `${CLAUDE_URL}${CLAUDE_PATH_NEW}`; },
  conversation(conversationId) { 
    return `${CLAUDE_URL}${buildPath(CLAUDE_PATH_CONVERSATION, { conversationId })}`;
  },
  
  // RISKY/INTERNAL URLs - API endpoints, may change without notice
  // These are internal Claude.ai API patterns observed through network monitoring
  // CAUTION: These may break if Claude.ai changes their internal API structure
  apiConversations(orgId, queryParams = {}) { 
    const path = buildPath(CLAUDE_PATH_API_CONVERSATIONS, { orgId });
    const url = `${CLAUDE_URL}${path}`;
    const query = new URLSearchParams(queryParams).toString();
    return query ? `${url}?${query}` : url;
  },
  apiConversation(orgId, conversationId) { 
    return `${CLAUDE_URL}${buildPath(CLAUDE_PATH_API_CONVERSATION, { orgId, conversationId })}`;
  },
  apiCompletion(orgId, conversationId) { 
    return `${CLAUDE_URL}${buildPath(CLAUDE_PATH_API_COMPLETION, { orgId, conversationId })}`;
  }
};

// ============================================
// RELAY URL BUILDERS - Using resolved constants
// ============================================

const RELAY_URLS = {
  websocket(port = WEBSOCKET_PORT) { 
    return `${WS_PROTOCOL}${RELAY_HOST}:${port}`; 
  },
  health() { 
    return `${HTTP_PROTOCOL}${RELAY_HOST}:${HEALTH_PORT}${HEALTH_PATH}`; 
  },
  takeover() { 
    return `${HTTP_PROTOCOL}${RELAY_HOST}:${HEALTH_PORT}${TAKEOVER_PATH}`; 
  },
  // Path constants for route matching in server
  paths: {
    HEALTH: HEALTH_PATH,
    TAKEOVER: TAKEOVER_PATH
  }
};

// ============================================
// MAIN CONFIGURATION OBJECT
// Now just assembles all the resolved values
// ============================================

const config = {
  // Component version
  VERSION,
  COMPONENT_NAME,
  
  // Network settings
  WEBSOCKET_PORT,
  HEALTH_PORT,
  RELAY_HOST,
  CLAUDE_URL,
  CLAUDE_DOMAIN,
  
  // Timeouts
  OPERATION_TIMEOUT,
  COMPLETION_TIMEOUT,
  KEEPALIVE_INTERVAL,
  RECONNECT_INTERVAL,
  DEFAULT_TIMEOUT,
  MAX_RECONNECT_DELAY,
  HEALTH_CHECK_TIMEOUT,
  RELAY_REQUEST_TIMEOUT,
  RELAY_CONNECTION_TIMEOUT,
  GRACE_PERIOD_MS,
  STALE_THRESHOLD_MS,
  OPERATION_CLEANUP_AGE,
  
  // Operational limits
  MAX_RETRIES,
  RETRY_DELAY_MS,
  BATCH_SIZE,
  MAX_CONCURRENT,
  POLL_INTERVAL_MS,
  SEQUENTIAL_DELAY_MS,
  API_BATCH_SIZE,
  MAX_ELEMENTS_DEFAULT,
  LOG_BATCH_INTERVAL_MS,
  
  // Other settings
  CLIENT_NAME_OVERRIDE,
  VERBOSE_MODE,
  LOG_DIR,
  DEBUG_MODE,
  LOG_LEVEL,
  ENABLE_HEALTH_CHECK,
  
  // URL builders
  CLAUDE_URLS,
  RELAY_URLS,
  
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
    
    const current = this.parseVersion(VERSION);
    const other = this.parseVersion(otherVersion);
    
    if (requireExact) {
      return VERSION === otherVersion;
    }
    
    if (requireMinor) {
      return current.major === other.major && current.minor === other.minor;
    }
    
    return current.major === other.major;
  },
  
  getVersionMismatchMessage(componentName, theirVersion) {
    const current = this.parseVersion(VERSION);
    const other = this.parseVersion(theirVersion);
    
    if (current.major !== other.major) {
      return `Major version mismatch with ${componentName}: ${VERSION} vs ${theirVersion}. Please update all components.`;
    } else if (current.minor !== other.minor) {
      return `Minor version difference with ${componentName}: ${VERSION} vs ${theirVersion}. Consider updating for best compatibility.`;
    } else {
      return `Patch version difference with ${componentName}: ${VERSION} vs ${theirVersion}. Should be compatible.`;
    }
  },
  
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
if (DEBUG_MODE) {
  console.log('MCP Server Config loaded:', {
    version: VERSION,
    websocketPort: WEBSOCKET_PORT,
    environment: process.env.NODE_ENV || 'production'
  });
}

// Freeze config to prevent accidental mutations
module.exports = Object.freeze(config);