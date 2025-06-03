// Tools Index
// Central import/export for all MCP tools

// Import all tool modules
const { coreTools, coreHandlers } = require('./core-tools');
const { tabOperationTools, tabOperationHandlers } = require('./tab-operations');
const { conversationTools, conversationHandlers } = require('./conversation-tools');
const { tabManagementTools, tabManagementHandlers } = require('./tab-management');
const { debugTools, debugHandlers } = require('./debug-tools');
const { workflowTools, workflowHandlers } = require('./workflow-tools');
const { networkTools, networkHandlers } = require('./network-tools');

/**
 * Combined tools array for MCP server registration
 */
const allTools = [
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
  
  // Workflow tools
  ...workflowTools,
  
  // Network inspection tools
  ...networkTools
];

/**
 * Combined handlers object for tool execution
 */
const allHandlers = {
  ...coreHandlers,
  ...tabOperationHandlers,
  ...conversationHandlers,
  ...tabManagementHandlers,
  ...debugHandlers,
  ...workflowHandlers,
  ...networkHandlers
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