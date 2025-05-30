/**
 * Example of migrating from console.log to structured logging
 */

const { Logger, getLogger } = require('./logger');

// Before: Scattered console.log statements
function oldWay() {
  console.log('CCM Extension: Connecting to WebSocket Hub on port', 54321);
  console.log('CCM Extension: Connected to WebSocket Hub');
  console.log('CCM Extension: Keep-alive alarm triggered');
  console.log('CCM Extension: WebSocket connection is healthy');
  console.log('CCM Extension: Keep-alive alarm triggered');
  console.log('CCM Extension: WebSocket connection is healthy');
  // ... this repeats every 15 seconds
}

// After: Structured logging with levels and rate limiting
function newWay() {
  const logger = getLogger('extension');
  
  // Important lifecycle events
  logger.info('Connecting to WebSocket Hub', { port: 54321 });
  logger.info('Connected to WebSocket Hub');
  
  // Repetitive logs are rate-limited
  logger.debugLimited('Keep-alive alarm triggered');
  logger.debugLimited('WebSocket connection is healthy');
  logger.debugLimited('Keep-alive alarm triggered');
  logger.debugLimited('WebSocket connection is healthy');
  // ... after 10 occurrences, these are suppressed
}

// Example: Different log levels
function logLevels() {
  const logger = new Logger('Example', { level: 'debug' });
  
  logger.error('Critical error occurred', { code: 500, stack: 'Error...' });
  logger.warn('Connection unstable', { retries: 3 });
  logger.info('Service started successfully');
  logger.debug('Processing message', { type: 'keepalive', timestamp: Date.now() });
  logger.verbose('Detailed trace info', { headers: {}, body: {} });
}

// Example: Child loggers for sub-components
function childLoggers() {
  const mainLogger = getLogger('mcp');
  const hubLogger = mainLogger.child('hub');
  const toolLogger = mainLogger.child('tools');
  
  mainLogger.info('MCP server starting');
  hubLogger.debug('WebSocket server listening', { port: 54321 });
  toolLogger.info('Loaded 25 tools');
}

// Example: Environment-based configuration
function environmentConfig() {
  // Set via environment variables:
  // CCM_LOG_LEVEL=debug node script.js    # Show debug logs
  // CCM_QUIET=1 node script.js           # Only show errors
  
  const logger = getLogger('extension');
  logger.info('This shows in normal mode');
  logger.debug('This only shows when CCM_LOG_LEVEL=debug');
  logger.error('This always shows, even in quiet mode');
}

// Example: Migration pattern for existing code
class ExampleComponent {
  constructor() {
    this.logger = new Logger('ExampleComponent');
  }
  
  // Before:
  oldMethod() {
    console.log('CCM Extension: Handling get_claude_tabs from Claude Code (requestId: 123)');
    try {
      // ... do work
      console.log('CCM Extension: Found 3 Claude tabs');
    } catch (error) {
      console.error('CCM Extension: Error handling get_claude_tabs:', error);
    }
  }
  
  // After:
  newMethod() {
    this.logger.debug('Handling request', {
      type: 'get_claude_tabs',
      source: 'Claude Code',
      requestId: 123
    });
    
    try {
      // ... do work
      this.logger.info('Found Claude tabs', { count: 3 });
    } catch (error) {
      this.logger.error('Failed to get Claude tabs', {
        error: error.message,
        stack: error.stack,
        requestId: 123
      });
    }
  }
}

// Demo all examples
console.log('=== Old Way ===');
oldWay();

console.log('\n=== New Way ===');
newWay();

console.log('\n=== Log Levels ===');
logLevels();

console.log('\n=== Child Loggers ===');
childLoggers();

console.log('\n=== Environment Config ===');
console.log('Set CCM_LOG_LEVEL=debug or CCM_QUIET=1 to see different output');

console.log('\n=== Component Example ===');
const component = new ExampleComponent();
console.log('Old method output:');
component.oldMethod();
console.log('\nNew method output:');
component.newMethod();