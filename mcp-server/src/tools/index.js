// Tools Index
// Central import/export for all MCP tools

// Import legacy tool modules (preserving backward compatibility)
const { coreTools, coreHandlers } = require('./core-tools');
const { tabOperationTools, tabOperationHandlers } = require('./tab-operations');
const { conversationTools, conversationHandlers } = require('./conversation-tools');
const { tabManagementTools, tabManagementHandlers } = require('./tab-management');
const { debugTools, debugHandlers } = require('./debug-tools');
const { networkTools, networkHandlers } = require('./network-tools');

// Import new reorganized tool modules
const { systemTools, systemHandlers } = require('./system-tools');
const { chromeTools, chromeHandlers } = require('./chrome-tools');
const { tabTools, tabHandlers } = require('./tab-tools');
const { apiTools, apiHandlers } = require('./api-tools');

/**
 * Combined tools array for MCP server registration
 * 
 * BACKWARD COMPATIBILITY: Both legacy and new tools are included to ensure
 * zero downtime during the transition to the reorganized architecture.
 * Legacy tools will be deprecated in a future release after validation.
 */
const allTools = [
  // LEGACY TOOLS (backward compatibility - will be deprecated)
  // Core system tools
  ...coreTools,
  
  // Tab operations (spawn, send_message_async, get_response, forward)
  ...tabOperationTools,
  
  // Conversation management
  ...conversationTools,
  
  // Tab management and batch operations
  ...tabManagementTools,
  
  // Debug and script execution tools
  ...debugTools,
  
  
  // Network inspection tools
  ...networkTools,

  // NEW REORGANIZED TOOLS (pure domain separation)
  // System infrastructure tools
  ...systemTools,
  
  // Chrome browser control tools
  ...chromeTools,
  
  // Tab operations via tabId only
  ...tabTools,
  
  // Claude.ai API operations via conversationId only
  ...apiTools
];

/**
 * Combined handlers object for tool execution
 */
const allHandlers = {
  // Legacy handlers (backward compatibility)
  ...coreHandlers,
  ...tabOperationHandlers,
  ...conversationHandlers,
  ...tabManagementHandlers,
  ...debugHandlers,
  ...networkHandlers,
  
  // New reorganized handlers
  ...systemHandlers,
  ...chromeHandlers,
  ...tabHandlers,
  ...apiHandlers
};

/**
 * Get handler for a specific tool
 */
function getToolHandler(toolName) {
  return allHandlers[toolName];
}

/**
 * Check if a tool exists
 */
function hasHandler(toolName) {
  return toolName in allHandlers;
}

module.exports = {
  allTools,
  allHandlers,
  getToolHandler,
  hasHandler
};