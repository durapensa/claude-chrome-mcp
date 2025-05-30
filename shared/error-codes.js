/**
 * Standardized Error Codes for Claude Chrome MCP
 * 
 * Consistent error codes across all components
 */

// Error categories (first digit)
const CATEGORY = {
  GENERAL: 1000,      // General errors
  TAB: 2000,          // Tab-related errors
  MESSAGE: 3000,      // Message/communication errors
  NETWORK: 4000,      // Network/connection errors
  CHROME: 5000,       // Chrome/extension errors
  MCP: 6000,          // MCP protocol errors
  VALIDATION: 7000    // Input validation errors
};

// Error codes
const ERROR_CODES = {
  // General errors (1xxx)
  UNKNOWN_ERROR: 1000,
  NOT_IMPLEMENTED: 1001,
  OPERATION_TIMEOUT: 1002,
  INVALID_STATE: 1003,
  
  // Tab errors (2xxx)
  TAB_NOT_FOUND: 2001,
  TAB_CREATE_FAILED: 2002,
  TAB_NOT_CLAUDE: 2003,
  TAB_ALREADY_CLOSED: 2004,
  TAB_UNSAVED_CONTENT: 2005,
  
  // Message errors (3xxx)
  MESSAGE_SEND_FAILED: 3001,
  MESSAGE_INPUT_NOT_FOUND: 3002,
  SEND_BUTTON_NOT_FOUND: 3003,
  CLAUDE_NOT_READY: 3004,
  RESPONSE_TIMEOUT: 3005,
  
  // Network errors (4xxx)
  WEBSOCKET_NOT_CONNECTED: 4001,
  WEBSOCKET_CONNECTION_LOST: 4002,
  HUB_NOT_RESPONDING: 4003,
  NETWORK_REQUEST_FAILED: 4004,
  
  // Chrome errors (5xxx)
  DEBUGGER_ATTACH_FAILED: 5001,
  DEBUGGER_NOT_ATTACHED: 5002,
  SCRIPT_EXECUTION_FAILED: 5003,
  CHROME_API_ERROR: 5004,
  EXTENSION_NOT_LOADED: 5005,
  
  // MCP errors (6xxx)
  MCP_TIMEOUT: 6001,
  MCP_INVALID_PARAMS: 6002,
  MCP_TOOL_NOT_FOUND: 6003,
  MCP_CLIENT_ERROR: 6004,
  
  // Validation errors (7xxx)
  MISSING_REQUIRED_PARAM: 7001,
  INVALID_PARAM_TYPE: 7002,
  PARAM_OUT_OF_RANGE: 7003,
  INVALID_URL_FORMAT: 7004,
  INVALID_UUID_FORMAT: 7005
};

// Error messages
const ERROR_MESSAGES = {
  [ERROR_CODES.TAB_NOT_FOUND]: 'Tab not found',
  [ERROR_CODES.TAB_CREATE_FAILED]: 'Failed to create new tab',
  [ERROR_CODES.TAB_NOT_CLAUDE]: 'Tab is not a Claude.ai tab',
  [ERROR_CODES.TAB_ALREADY_CLOSED]: 'Tab is already closed',
  [ERROR_CODES.TAB_UNSAVED_CONTENT]: 'Tab has unsaved content',
  
  [ERROR_CODES.MESSAGE_SEND_FAILED]: 'Failed to send message',
  [ERROR_CODES.MESSAGE_INPUT_NOT_FOUND]: 'Message input field not found',
  [ERROR_CODES.SEND_BUTTON_NOT_FOUND]: 'Send button not found or disabled',
  [ERROR_CODES.CLAUDE_NOT_READY]: 'Claude is not ready to receive messages',
  [ERROR_CODES.RESPONSE_TIMEOUT]: 'Response timeout',
  
  [ERROR_CODES.WEBSOCKET_NOT_CONNECTED]: 'WebSocket not connected',
  [ERROR_CODES.WEBSOCKET_CONNECTION_LOST]: 'WebSocket connection lost',
  [ERROR_CODES.HUB_NOT_RESPONDING]: 'Hub not responding',
  [ERROR_CODES.NETWORK_REQUEST_FAILED]: 'Network request failed',
  
  [ERROR_CODES.DEBUGGER_ATTACH_FAILED]: 'Failed to attach debugger',
  [ERROR_CODES.DEBUGGER_NOT_ATTACHED]: 'Debugger not attached',
  [ERROR_CODES.SCRIPT_EXECUTION_FAILED]: 'Script execution failed',
  [ERROR_CODES.CHROME_API_ERROR]: 'Chrome API error',
  [ERROR_CODES.EXTENSION_NOT_LOADED]: 'Extension not loaded',
  
  [ERROR_CODES.MCP_TIMEOUT]: 'MCP operation timeout',
  [ERROR_CODES.MCP_INVALID_PARAMS]: 'Invalid MCP parameters',
  [ERROR_CODES.MCP_TOOL_NOT_FOUND]: 'MCP tool not found',
  [ERROR_CODES.MCP_CLIENT_ERROR]: 'MCP client error',
  
  [ERROR_CODES.MISSING_REQUIRED_PARAM]: 'Missing required parameter',
  [ERROR_CODES.INVALID_PARAM_TYPE]: 'Invalid parameter type',
  [ERROR_CODES.PARAM_OUT_OF_RANGE]: 'Parameter out of range',
  [ERROR_CODES.INVALID_URL_FORMAT]: 'Invalid URL format',
  [ERROR_CODES.INVALID_UUID_FORMAT]: 'Invalid UUID format'
};

/**
 * Standardized error class
 */
class StandardError extends Error {
  constructor(code, details = {}) {
    const message = ERROR_MESSAGES[code] || 'Unknown error';
    super(message);
    
    this.name = 'StandardError';
    this.code = code;
    this.message = message;
    this.details = details;
    this.timestamp = Date.now();
  }
  
  toJSON() {
    return {
      error: true,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
  
  toString() {
    return `[${this.code}] ${this.message}`;
  }
}

/**
 * Create a standard error response
 */
function createError(code, details = {}) {
  return new StandardError(code, details);
}

/**
 * Check if an error is a standard error
 */
function isStandardError(error) {
  return error instanceof StandardError;
}

/**
 * Get error category
 */
function getErrorCategory(code) {
  const category = Math.floor(code / 1000) * 1000;
  const categoryNames = {
    1000: 'GENERAL',
    2000: 'TAB',
    3000: 'MESSAGE',
    4000: 'NETWORK',
    5000: 'CHROME',
    6000: 'MCP',
    7000: 'VALIDATION'
  };
  return categoryNames[category] || 'UNKNOWN';
}

// Export for use in both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ERROR_CODES,
    ERROR_MESSAGES,
    StandardError,
    createError,
    isStandardError,
    getErrorCategory
  };
}