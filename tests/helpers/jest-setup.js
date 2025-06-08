// Jest setup file - runs before all tests

// Add global timeout for individual expects
global.withTimeout = (promise, timeoutMs = 5000, errorMessage) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

// Override console.error to catch unhandled errors
const originalConsoleError = console.error;
console.error = (...args) => {
  // Look for specific error patterns that indicate setup issues
  const errorStr = args.join(' ');
  
  if (errorStr.includes('ECONNREFUSED') || errorStr.includes('WebSocket connection failed')) {
    throw new Error(
      'CONNECTION FAILED: Cannot connect to relay server.\n' +
      'Ensure the MCP daemon is running: mcp daemon status'
    );
  }
  
  if (errorStr.includes('chrome.tabs') || errorStr.includes('chrome.runtime')) {
    throw new Error(
      'CHROME API ERROR: Extension cannot access Chrome APIs.\n' +
      'Ensure extension has proper permissions and is loaded correctly.'
    );
  }
  
  originalConsoleError.apply(console, args);
};

// Set shorter timeout for all tests by default
jest.setTimeout(15000);

// Import tab hygiene for global cleanup
const { finalTabCleanup } = require('./tab-hygiene');

// Register global cleanup to run after ALL test suites complete
// This ensures no tabs are left open even if individual test cleanup fails
if (typeof afterAll === 'function') {
  global.afterAll(async () => {
    console.log = originalConsoleError; // Temporarily restore console for cleanup messages
    await finalTabCleanup();
  }, 30000);
}