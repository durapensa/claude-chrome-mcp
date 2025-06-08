// Error Handling Utility for Chrome Extension
// Provides consistent error handling patterns across extension modules

/**
 * Wraps an async function to provide consistent success/error response format
 * This is the most common pattern used throughout the extension
 * 
 * @param {Function} asyncFunction - The async function to wrap
 * @param {string} logPrefix - Prefix for console.error messages (e.g., 'CCM Extension: Failed to send message')
 * @returns {Function} Wrapped function that returns {success: boolean, error?: string, ...result}
 */
export function withErrorHandling(asyncFunction, logPrefix) {
  return async function(...args) {
    try {
      const result = await asyncFunction.apply(this, args);
      
      // If result is already in success/error format, return as-is
      if (result && typeof result === 'object' && 'success' in result) {
        return result;
      }
      
      // Otherwise wrap in success format
      return { success: true, ...result };
    } catch (error) {
      console.error(`${logPrefix}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  };
}

/**
 * Wraps an async function to provide consistent error throwing with logging
 * Used for functions that should propagate errors to the caller
 * 
 * @param {Function} asyncFunction - The async function to wrap
 * @param {string} logPrefix - Prefix for console.error messages
 * @param {string} throwPrefix - Prefix for the thrown error message
 * @returns {Function} Wrapped function that logs errors and re-throws with consistent message
 */
export function withErrorThrow(asyncFunction, logPrefix, throwPrefix) {
  return async function(...args) {
    try {
      return await asyncFunction.apply(this, args);
    } catch (error) {
      console.error(`${logPrefix}:`, error);
      throw new Error(`${throwPrefix}: ${error.message}`);
    }
  };
}

/**
 * Wraps an async function to provide custom error response format
 * Used for specialized error handling with custom response structure
 * 
 * @param {Function} asyncFunction - The async function to wrap
 * @param {string} logPrefix - Prefix for console.error messages
 * @param {string} reason - Default reason for failure
 * @param {Object} customFields - Additional fields to include in error response
 * @returns {Function} Wrapped function that returns custom error format
 */
export function withCustomErrorHandling(asyncFunction, logPrefix, reason, customFields = {}) {
  return async function(...args) {
    try {
      const result = await asyncFunction.apply(this, args);
      
      // If result is already in success format, return as-is
      if (result && typeof result === 'object' && ('success' in result || 'reason' in result)) {
        return result;
      }
      
      // Otherwise wrap in success format
      return { success: true, ...result };
    } catch (error) {
      console.error(`${logPrefix}:`, error);
      return {
        success: false,
        reason: reason,
        error: error.message,
        ...customFields
      };
    }
  };
}

/**
 * Creates a set of wrapped methods for an object/class
 * Useful for wrapping multiple methods at once with consistent error handling
 * 
 * @param {Object} methodsObject - Object containing methods to wrap
 * @param {string} logPrefix - Base prefix for console.error messages
 * @param {string} pattern - Error handling pattern: 'standard', 'throw', or 'custom'
 * @param {Object} options - Additional options for error handling
 * @returns {Object} Object with wrapped methods
 */
export function wrapMethods(methodsObject, logPrefix, pattern = 'standard', options = {}) {
  const wrapped = {};
  
  for (const [methodName, method] of Object.entries(methodsObject)) {
    if (typeof method !== 'function') {
      wrapped[methodName] = method;
      continue;
    }
    
    const methodLogPrefix = `${logPrefix}: ${methodName}`;
    
    switch (pattern) {
      case 'throw':
        wrapped[methodName] = withErrorThrow(
          method, 
          methodLogPrefix, 
          options.throwPrefix || `Failed to ${methodName}`
        );
        break;
      case 'custom':
        wrapped[methodName] = withCustomErrorHandling(
          method,
          methodLogPrefix,
          options.reason || `Error in ${methodName}`,
          options.customFields || {}
        );
        break;
      case 'standard':
      default:
        wrapped[methodName] = withErrorHandling(method, methodLogPrefix);
        break;
    }
  }
  
  return wrapped;
}

/**
 * Utility to validate that an error response has the expected format
 * Useful for testing error handling
 * 
 * @param {any} response - The response to validate
 * @param {string} pattern - Expected pattern: 'standard', 'custom'
 * @returns {boolean} True if response matches expected error format
 */
export function validateErrorResponse(response, pattern = 'standard') {
  if (!response || typeof response !== 'object') {
    return false;
  }
  
  switch (pattern) {
    case 'standard':
      return response.success === false && typeof response.error === 'string';
    case 'custom':
      return response.success === false && 
             typeof response.reason === 'string' && 
             typeof response.error === 'string';
    default:
      return false;
  }
}

/**
 * Wraps an async function to provide consistent lock management with error handling
 * Used for operations that acquire locks and need cleanup on errors
 * 
 * @param {Function} asyncFunction - The async function to wrap
 * @param {string} logPrefix - Prefix for console.error messages
 * @param {Function} acquireLock - Function to acquire lock (should be called with lockKey)
 * @param {Function} releaseLock - Function to release lock (should be called with lockKey)
 * @param {Function} getLockKey - Function to extract lock key from arguments
 * @returns {Function} Wrapped function that handles lock acquire/release and errors
 */
export function withLockManagement(asyncFunction, logPrefix, acquireLock, releaseLock, getLockKey) {
  return async function(...args) {
    const lockKey = getLockKey ? getLockKey(...args) : args[0];
    let lockAcquired = false;
    
    try {
      // Acquire lock if acquireLock function provided
      if (acquireLock) {
        await acquireLock(lockKey);
        lockAcquired = true;
      }
      
      const result = await asyncFunction.apply(this, args);
      
      // Release lock on success
      if (lockAcquired && releaseLock) {
        releaseLock(lockKey);
        lockAcquired = false;
      }
      
      // If result is already in success/error format, return as-is
      if (result && typeof result === 'object' && 'success' in result) {
        return result;
      }
      
      // Otherwise wrap in success format
      return { success: true, ...result };
    } catch (error) {
      // Release lock on error
      if (lockAcquired && releaseLock) {
        releaseLock(lockKey);
      }
      
      console.error(`${logPrefix}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  };
}

/**
 * Wraps an async function to provide Chrome API specific error handling
 * Used for Chrome API calls that need specific error type detection
 * 
 * @param {Function} asyncFunction - The async function to wrap
 * @param {string} logPrefix - Prefix for console.error messages
 * @param {Object} errorMappings - Object mapping error patterns to error types
 * @param {Object} defaultErrorInfo - Default error info if no pattern matches
 * @returns {Function} Wrapped function that detects Chrome API error types
 */
export function withChromeAPIErrorHandling(asyncFunction, logPrefix, errorMappings = {}, defaultErrorInfo = {}) {
  return async function(...args) {
    try {
      const result = await asyncFunction.apply(this, args);
      
      // If result is already in success/error format, return as-is
      if (result && typeof result === 'object' && 'success' in result) {
        return result;
      }
      
      // Otherwise wrap in success format
      return { success: true, ...result };
    } catch (error) {
      console.error(`${logPrefix}:`, error);
      
      // Check for specific error patterns
      for (const [pattern, errorInfo] of Object.entries(errorMappings)) {
        if (error.message.includes(pattern)) {
          return {
            success: false,
            error: errorInfo.error || error.message,
            errorType: errorInfo.errorType,
            ...errorInfo.additionalFields
          };
        }
      }
      
      // Default error response
      return {
        success: false,
        error: error.message,
        ...defaultErrorInfo
      };
    }
  };
}

/**
 * Validates parameters and returns standardized error response if validation fails
 * Used for consistent parameter validation across methods
 * 
 * @param {Object} params - Parameters to validate
 * @param {Array} requiredFields - Array of required field names
 * @param {Object} validators - Object mapping field names to validator functions
 * @returns {Object|null} Error response object if validation fails, null if valid
 */
export function validateParams(params, requiredFields = [], validators = {}) {
  // Check for missing required fields
  for (const field of requiredFields) {
    if (!params || params[field] === undefined || params[field] === null) {
      return {
        success: false,
        error: `Missing required parameter: ${field}`,
        errorType: 'validation_error'
      };
    }
  }
  
  // Run custom validators
  for (const [field, validator] of Object.entries(validators)) {
    if (params && params[field] !== undefined) {
      const validationResult = validator(params[field]);
      if (validationResult !== true) {
        return {
          success: false,
          error: typeof validationResult === 'string' ? validationResult : `Invalid ${field}`,
          errorType: 'validation_error'
        };
      }
    }
  }
  
  return null; // No validation errors
}

/**
 * Utility to validate that a success response has the expected format
 * Useful for testing success cases
 * 
 * @param {any} response - The response to validate
 * @returns {boolean} True if response indicates success
 */
export function validateSuccessResponse(response) {
  if (!response || typeof response !== 'object') {
    return false;
  }
  
  return response.success === true;
}