// Tools Index
// Central import/export for all MCP tools

// Import reorganized tool modules
const { systemTools, systemHandlers } = require('./system-tools');
const { chromeTools, chromeHandlers } = require('./chrome-tools');
const { tabTools, tabHandlers } = require('./tab-tools');
const { apiTools, apiHandlers } = require('./api-tools');

/**
 * Combined tools array for MCP server registration
 * 
 * REORGANIZED ARCHITECTURE: Clean domain separation with new tool organization:
 * - system_*: Core infrastructure and health monitoring
 * - chrome_*: Browser control and extension management  
 * - tab_*: Tab operations via tabId only
 * - api_*: Claude.ai API operations via conversationId only
 */
const allTools = [
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