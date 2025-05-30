/**
 * Example usage of standardized error codes
 */

const { ERROR_CODES, createError, isStandardError, getErrorCategory } = require('./error-codes');

// Example 1: Creating and throwing errors
function sendMessage(tabId, message) {
  if (!tabId) {
    throw createError(ERROR_CODES.MISSING_REQUIRED_PARAM, {
      param: 'tabId',
      received: tabId
    });
  }
  
  if (typeof message !== 'string') {
    throw createError(ERROR_CODES.INVALID_PARAM_TYPE, {
      param: 'message',
      expected: 'string',
      received: typeof message
    });
  }
  
  // Simulate tab not found
  const tabExists = false;
  if (!tabExists) {
    throw createError(ERROR_CODES.TAB_NOT_FOUND, {
      tabId: tabId,
      availableTabs: [123, 456]
    });
  }
}

// Example 2: Handling errors
try {
  sendMessage(null, 'Hello');
} catch (error) {
  if (isStandardError(error)) {
    console.log('Standard error caught:', error.toString());
    console.log('Error code:', error.code);
    console.log('Category:', getErrorCategory(error.code));
    console.log('Details:', error.details);
    console.log('JSON:', JSON.stringify(error.toJSON(), null, 2));
  } else {
    console.log('Unknown error:', error.message);
  }
}

// Example 3: Error response formatting
function formatErrorResponse(error) {
  if (isStandardError(error)) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        category: getErrorCategory(error.code),
        details: error.details
      }
    };
  }
  
  // Fallback for non-standard errors
  return {
    success: false,
    error: {
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: error.message || 'Unknown error',
      category: 'GENERAL'
    }
  };
}

// Example 4: Using in async functions
async function getClaudeResponse(tabId) {
  try {
    // Simulate timeout
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(createError(ERROR_CODES.RESPONSE_TIMEOUT, {
          tabId: tabId,
          timeoutMs: 30000
        }));
      }, 100);
    });
  } catch (error) {
    // Re-throw standard errors, wrap others
    if (isStandardError(error)) {
      throw error;
    }
    throw createError(ERROR_CODES.UNKNOWN_ERROR, {
      originalError: error.message
    });
  }
}

// Test async error handling
(async () => {
  try {
    await getClaudeResponse(123);
  } catch (error) {
    console.log('\nAsync error example:');
    console.log(formatErrorResponse(error));
  }
})();

// Example 5: Error code reference
console.log('\nAvailable error codes by category:');
console.log('TAB errors:', Object.keys(ERROR_CODES).filter(k => ERROR_CODES[k] >= 2000 && ERROR_CODES[k] < 3000));
console.log('MESSAGE errors:', Object.keys(ERROR_CODES).filter(k => ERROR_CODES[k] >= 3000 && ERROR_CODES[k] < 4000));