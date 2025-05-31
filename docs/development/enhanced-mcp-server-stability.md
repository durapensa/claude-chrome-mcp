# Enhanced MCP Server Stability Guide

Based on analysis of the MCP SDK documentation, web research, and the original compass artifact, this guide provides comprehensive best practices for creating a reliable claude-chrome-mcp server that handles lifecycle events properly and prevents early exits.

## Core Stability Principles

### 1. Proper Process Lifecycle Management

The MCP protocol explicitly supports server restart capabilities during runtime. The key is implementing proper lifecycle phases:

- **Initialization Phase**: Proper capability negotiation and handshake completion
- **Operation Phase**: Normal message exchange with robust error handling  
- **Shutdown Phase**: Graceful cleanup and resource management

### 2. Transport Layer Reliability

For stdio transport (which claude-chrome-mcp uses), the server must:

- Handle SIGTERM/SIGKILL gracefully
- Implement proper stream management
- Avoid early exits during message processing
- Maintain connection state properly

### 3. Error Handling and Recovery

Implement comprehensive error handling:

- Catch and handle all exceptions to prevent crashes
- Implement timeout mechanisms for operations
- Use structured logging for debugging
- Provide circuit breaker patterns for external dependencies

## Enhanced Server Implementation

### Key Improvements for Stability

1. **Robust Error Boundaries**: Wrap all operations in try-catch blocks
2. **Process Signal Handling**: Handle SIGTERM, SIGINT, and SIGKILL properly
3. **Connection State Management**: Track and manage connection lifecycle
4. **Timeout Protection**: Implement timeouts for all async operations
5. **Graceful Shutdown**: Ensure clean resource cleanup

### Enhanced Error Tracking

The ErrorTracker class should be enhanced with:

```javascript
class EnhancedErrorTracker {
  constructor(maxErrors = 100) {
    this.errors = [];
    this.maxErrors = maxErrors;
    this.errorCounts = new Map();
    this.criticalErrors = [];
    this.lastHeartbeat = Date.now();
  }

  logError(error, context = {}, severity = 'error') {
    const errorEntry = {
      timestamp: Date.now(),
      message: error.message || error,
      stack: error.stack,
      context,
      severity,
      id: this.generateErrorId()
    };

    this.errors.push(errorEntry);
    
    if (severity === 'critical') {
      this.criticalErrors.push(errorEntry);
      // Don't exit on critical errors - log and continue
      console.error(`[CRITICAL] ${errorEntry.id}:`, error.message, context);
    }

    // Prevent memory leaks
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    const errorKey = error.message || error.toString();
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    return errorEntry.id;
  }

  updateHeartbeat() {
    this.lastHeartbeat = Date.now();
  }

  getHealthStatus() {
    const timeSinceHeartbeat = Date.now() - this.lastHeartbeat;
    const recentErrors = this.errors.filter(e => Date.now() - e.timestamp < 60000);
    
    return {
      healthy: timeSinceHeartbeat < 30000 && recentErrors.length < 10,
      timeSinceHeartbeat,
      recentErrorCount: recentErrors.length,
      criticalErrorCount: this.criticalErrors.length
    };
  }
}
```

### Enhanced Lifecycle Manager

```javascript
class EnhancedLifecycleManager extends EventEmitter {
  constructor() {
    super();
    this.state = 'initializing';
    this.connections = new Map();
    this.shutdownPromise = null;
    this.heartbeatInterval = null;
    this.setupSignalHandlers();
    this.setupHeartbeat();
  }

  setupSignalHandlers() {
    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, initiating graceful shutdown...');
      this.initiateGracefulShutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('Received SIGINT, initiating graceful shutdown...');
      this.initiateGracefulShutdown('SIGINT');
    });

    // Handle uncaught exceptions without crashing
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      errorTracker.logError(error, { source: 'uncaughtException' }, 'critical');
      // Don't exit - try to continue operation
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      errorTracker.logError(reason, { source: 'unhandledRejection' }, 'critical');
      // Don't exit - try to continue operation
    });
  }

  setupHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      errorTracker.updateHeartbeat();
      this.emit('heartbeat', errorTracker.getHealthStatus());
    }, 5000); // 5 second heartbeat
  }

  async initiateGracefulShutdown(signal) {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.state = 'shutting_down';
    
    this.shutdownPromise = this.performGracefulShutdown(signal);
    return this.shutdownPromise;
  }

  async performGracefulShutdown(signal) {
    console.log(`Starting graceful shutdown due to ${signal}...`);
    
    try {
      // Stop accepting new connections
      this.state = 'draining';
      
      // Clear heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      // Wait for active connections to finish (with timeout)
      const shutdownTimeout = 30000; // 30 seconds
      const shutdownStart = Date.now();
      
      while (this.connections.size > 0 && (Date.now() - shutdownStart) < shutdownTimeout) {
        console.log(`Waiting for ${this.connections.size} connections to finish...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Force close remaining connections
      for (const [id, connection] of this.connections) {
        try {
          connection.close();
        } catch (error) {
          console.error(`Error closing connection ${id}:`, error);
        }
      }

      this.connections.clear();
      this.state = 'shutdown';
      
      console.log('Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  registerConnection(id, connection) {
    this.connections.set(id, connection);
    console.log(`Registered connection ${id}, total: ${this.connections.size}`);
  }

  unregisterConnection(id) {
    this.connections.delete(id);
    console.log(`Unregistered connection ${id}, remaining: ${this.connections.size}`);
  }
}
```

### Enhanced Server Implementation

```javascript
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

class RobustMcpServer {
  constructor() {
    this.server = null;
    this.transport = null;
    this.lifecycleManager = new EnhancedLifecycleManager();
    this.errorTracker = new EnhancedErrorTracker();
    this.requestCount = 0;
    this.startTime = Date.now();
  }

  async start() {
    try {
      console.log('Starting robust MCP server...');
      
      // Create server with proper error handling
      this.server = new Server(
        {
          name: "claude-chrome-mcp",
          version: "2.4.0"
        },
        {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          }
        }
      );

      // Set up all tool handlers with error protection
      this.setupToolHandlers();
      
      // Create transport with error handling
      this.transport = new StdioServerTransport();
      
      // Handle transport errors
      this.transport.onclose = () => {
        console.log('Transport closed');
        this.lifecycleManager.unregisterConnection('main-transport');
      };

      this.transport.onerror = (error) => {
        console.error('Transport error:', error);
        this.errorTracker.logError(error, { source: 'transport' });
      };

      // Register transport connection
      this.lifecycleManager.registerConnection('main-transport', this.transport);

      // Connect with error handling
      await this.server.connect(this.transport);
      
      this.lifecycleManager.state = 'operational';
      console.log('MCP server started successfully');
      
      // Set up periodic health checks
      this.setupHealthChecks();
      
    } catch (error) {
      this.errorTracker.logError(error, { source: 'startup' }, 'critical');
      console.error('Failed to start MCP server:', error);
      throw error;
    }
  }

  setupToolHandlers() {
    // Wrap each tool handler with error protection
    const toolHandlers = {
      // ... (all existing tool handlers)
    };

    Object.entries(toolHandlers).forEach(([schemaType, handler]) => {
      this.server.setRequestHandler(schemaType, async (request) => {
        this.requestCount++;
        const requestId = `req_${this.requestCount}_${Date.now()}`;
        
        try {
          console.log(`[${requestId}] Handling ${schemaType}`);
          const result = await Promise.race([
            handler(request),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout')), 30000)
            )
          ]);
          console.log(`[${requestId}] Completed ${schemaType}`);
          return result;
        } catch (error) {
          this.errorTracker.logError(error, { 
            requestId, 
            schemaType, 
            request: request.params 
          });
          
          // Return error response instead of crashing
          return {
            error: {
              code: -32603,
              message: `Internal error: ${error.message}`,
              data: { requestId }
            }
          };
        }
      });
    });
  }

  setupHealthChecks() {
    setInterval(() => {
      const health = this.errorTracker.getHealthStatus();
      const uptime = Date.now() - this.startTime;
      
      console.log(`Health check: ${health.healthy ? 'HEALTHY' : 'UNHEALTHY'}, uptime: ${uptime}ms, requests: ${this.requestCount}`);
      
      if (!health.healthy) {
        console.warn('Server health degraded:', health);
      }
    }, 30000); // 30 second health checks
  }
}

// Start the robust server
async function main() {
  const server = new RobustMcpServer();
  
  try {
    await server.start();
    
    // Keep the process alive
    process.stdin.resume();
    
  } catch (error) {
    console.error('Server failed to start:', error);
    process.exit(1);
  }
}

// Only start if this is the main module
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
```

## Testing Strategy

### 1. Lifecycle Testing
- Test graceful shutdown scenarios
- Test signal handling (SIGTERM, SIGINT)
- Test connection cleanup
- Test error recovery

### 2. Stress Testing  
- High-frequency requests
- Concurrent operations
- Error injection
- Memory leak detection

### 3. Integration Testing
- Full workflow testing
- Chrome extension integration
- Network detection validation
- MCP notification pipeline

## Monitoring and Observability

### Key Metrics to Track
- Request count and rate
- Error rate and types
- Connection count
- Memory usage
- Response times
- Heartbeat status

### Logging Strategy
- Structured JSON logging
- Request/response correlation
- Error context preservation
- Performance metrics

## Deployment Considerations

### Process Management
- Use process managers (PM2, systemd)
- Implement health check endpoints
- Set up automatic restart policies
- Monitor resource usage

### Error Recovery
- Automatic restart on critical failures
- Circuit breaker patterns
- Graceful degradation
- State persistence where needed

This enhanced approach ensures the claude-chrome-mcp server remains stable and handles the complete MCP lifecycle properly, preventing early exits and providing robust error recovery.