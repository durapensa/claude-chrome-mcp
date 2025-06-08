// Tool Factory Utility
// Reduces code duplication by generating common tool patterns

/**
 * Creates a simple forwarding tool that passes all arguments to the extension
 * This is the most common pattern used by most tools
 * 
 * @param {string} name - Tool name
 * @param {string} description - Tool description
 * @param {object} zodSchema - Zod schema for validation (optional)
 * @returns {object} Tool definition and handler
 */
function createForwardingTool(name, description, zodSchema = {}) {
  return {
    tool: {
      name,
      description,
      zodSchema
    },
    handler: async (server, args) => {
      return await server.forwardToExtension(name, args);
    }
  };
}

/**
 * Creates a resource sync tool that manages resource state after forwarding
 * Used for tools that create/destroy resources like debugger sessions, network monitoring
 * 
 * @param {string} name - Tool name  
 * @param {string} description - Tool description
 * @param {object} zodSchema - Zod schema for validation
 * @param {function} syncHandler - Function to handle resource state sync
 * @returns {object} Tool definition and handler
 */
function createResourceSyncTool(name, description, zodSchema, syncHandler) {
  return {
    tool: {
      name,
      description, 
      zodSchema
    },
    handler: async (server, args) => {
      return await server.forwardWithResourceSync(name, args, syncHandler);
    }
  };
}

/**
 * Creates a batch of forwarding tools from an array of tool definitions
 * Reduces boilerplate when creating many similar forwarding tools
 * 
 * @param {Array} toolDefinitions - Array of {name, description, zodSchema} objects
 * @returns {object} Object with tools array and handlers object
 */
function createForwardingToolBatch(toolDefinitions) {
  const tools = [];
  const handlers = {};
  
  for (const def of toolDefinitions) {
    const { tool, handler } = createForwardingTool(def.name, def.description, def.zodSchema);
    tools.push(tool);
    handlers[def.name] = handler;
  }
  
  return { tools, handlers };
}

/**
 * Creates a tool with custom handler logic 
 * Used for tools that need specialized business logic beyond simple forwarding
 * 
 * @param {string} name - Tool name
 * @param {string} description - Tool description
 * @param {object} zodSchema - Zod schema for validation
 * @param {function} customHandler - Custom handler function (async (server, args) => result)
 * @returns {object} Tool definition and handler
 */
function createCustomTool(name, description, zodSchema, customHandler) {
  return {
    tool: {
      name,
      description,
      zodSchema
    },
    handler: customHandler
  };
}

/**
 * Helper to extract tool and handler objects from factory results
 * Makes it easy to integrate with existing tool file structures
 * 
 * @param {Array} factoryResults - Array of {tool, handler} objects from factory functions
 * @returns {object} Object with tools array and handlers object  
 */
function extractToolsAndHandlers(factoryResults) {
  const tools = factoryResults.map(result => result.tool);
  const handlers = {};
  
  for (const result of factoryResults) {
    handlers[result.tool.name] = result.handler;
  }
  
  return { tools, handlers };
}

module.exports = {
  createForwardingTool,
  createResourceSyncTool,
  createCustomTool,
  createForwardingToolBatch,
  extractToolsAndHandlers
};