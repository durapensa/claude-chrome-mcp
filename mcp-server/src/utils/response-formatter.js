/**
 * MCP Response Formatter Utility
 * Standardizes response formatting across all MCP tools
 * 
 * Consolidates the repeated pattern of:
 * return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
 */

/**
 * Formats any data into proper MCP response format
 * Handles all edge cases found in existing codebase
 * 
 * @param {*} data - Data to format (object, string, array, etc.)
 * @param {Error|string} error - Optional error to format
 * @returns {Object} Properly formatted MCP response
 */
function formatMCPResponse(data, error = null) {
  // Handle error cases first
  if (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `Error: ${errorMessage}`
      }]
    };
  }
  
  // Handle null/undefined
  if (data === null || data === undefined) {
    return {
      content: [{
        type: 'text',
        text: 'null'
      }]
    };
  }
  
  // Handle data that's already in MCP format (has content property)
  // This preserves existing functionality where some handlers return pre-formatted responses
  if (data && typeof data === 'object' && data.content && Array.isArray(data.content)) {
    return data; // Pass through unchanged
  }
  
  // Handle strings - pass through as-is
  if (typeof data === 'string') {
    return {
      content: [{
        type: 'text',
        text: data
      }]
    };
  }
  
  // Handle all other data types (objects, arrays, numbers, booleans)
  // JSON.stringify with pretty formatting (matches existing pattern)
  try {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }]
    };
  } catch (stringifyError) {
    // Fallback for non-serializable objects
    return {
      content: [{
        type: 'text',
        text: String(data)
      }]
    };
  }
}

/**
 * Creates a standardized error response
 * 
 * @param {Error|string} error - Error to format
 * @param {Object} context - Additional context for the error
 * @returns {Object} Formatted MCP error response
 */
function formatMCPError(error, context = {}) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const contextStr = Object.keys(context).length > 0 ? ` (${JSON.stringify(context)})` : '';
  
  return {
    content: [{
      type: 'text',
      text: `Error: ${errorMessage}${contextStr}`
    }]
  };
}

/**
 * Helper to format success responses with consistent structure
 * 
 * @param {*} data - Success data
 * @param {string} message - Optional success message
 * @returns {Object} Formatted MCP success response
 */
function formatMCPSuccess(data, message = null) {
  const response = {
    success: true,
    ...(message && { message }),
    ...(data && { data })
  };
  
  return formatMCPResponse(response);
}

module.exports = {
  formatMCPResponse,
  formatMCPError,
  formatMCPSuccess
};