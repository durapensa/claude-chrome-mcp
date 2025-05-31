#!/usr/bin/env node

/**
 * MCP Server Wrapper with Lifecycle Management
 * Provides restart capability and health monitoring for claude-chrome-mcp server
 */

const { MCPLifecycleManager, ServerState } = require('./lifecycle-manager');
const path = require('path');

class MCPServerWrapper {
  constructor(options = {}) {
    this.serverPath = path.join(__dirname, 'server.js');
    this.lifecycleManager = new MCPLifecycleManager({
      serverPath: this.serverPath,
      restartEnabled: options.restartEnabled !== false,
      maxRestarts: options.maxRestarts || 5,
      restartDelay: options.restartDelay || 2000,
      healthCheckInterval: options.healthCheckInterval || 30000,
      gracefulShutdownTimeout: options.gracefulShutdownTimeout || 30000
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Forward server stdout/stderr to parent process
    this.lifecycleManager.on('stdout', (data) => {
      process.stdout.write(data);
    });

    this.lifecycleManager.on('stderr', (data) => {
      process.stderr.write(data);
    });

    // Handle lifecycle events
    this.lifecycleManager.on('started', (info) => {
      console.error(`MCPWrapper: Server started (PID: ${info.pid}, Session: ${info.sessionId})`);
    });

    this.lifecycleManager.on('restarted', (info) => {
      console.error(`MCPWrapper: Server restarted (Count: ${info.restartCount}, Session: ${info.sessionId})`);
    });

    this.lifecycleManager.on('exit', (info) => {
      console.error(`MCPWrapper: Server exited (Code: ${info.code}, Signal: ${info.signal})`);
    });

    this.lifecycleManager.on('restart_failed', (error) => {
      console.error('MCPWrapper: Restart failed:', error.message);
    });

    this.lifecycleManager.on('stopped', (info) => {
      console.error(`MCPWrapper: Server stopped (Reason: ${info.reason}, Restarts: ${info.totalRestarts})`);
      process.exit(info.finalExitCode || 1);
    });

    this.lifecycleManager.on('health_check_failed', (info) => {
      if (info.failures > 3) {
        console.error(`MCPWrapper: Health check failed ${info.failures} times: ${info.reason}`);
      }
    });

    this.lifecycleManager.on('shutdown_complete', () => {
      console.error('MCPWrapper: Graceful shutdown complete');
      process.exit(0);
    });

    // Handle stdin for MCP protocol
    process.stdin.on('data', (data) => {
      if (this.lifecycleManager.process && !this.lifecycleManager.process.killed) {
        this.lifecycleManager.process.stdin.write(data);
      }
    });

    process.stdin.on('end', () => {
      console.error('MCPWrapper: Stdin closed, initiating shutdown');
      this.shutdown();
    });
  }

  async start() {
    try {
      await this.lifecycleManager.start();
    } catch (error) {
      console.error('MCPWrapper: Failed to start server:', error.message);
      process.exit(1);
    }
  }

  async shutdown() {
    await this.lifecycleManager.gracefulShutdown();
  }

  getStatus() {
    return this.lifecycleManager.getStatus();
  }
}

// Main execution
if (require.main === module) {
  const wrapper = new MCPServerWrapper({
    restartEnabled: process.env.MCP_RESTART_ENABLED !== 'false',
    maxRestarts: parseInt(process.env.MCP_MAX_RESTARTS) || 5,
    restartDelay: parseInt(process.env.MCP_RESTART_DELAY) || 2000
  });

  wrapper.start().catch((error) => {
    console.error('MCPWrapper: Fatal error:', error);
    process.exit(1);
  });

  // Add health status endpoint via environment variable
  if (process.env.MCP_HEALTH_PORT) {
    const http = require('http');
    const port = parseInt(process.env.MCP_HEALTH_PORT);
    
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        const status = wrapper.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: status.state === ServerState.OPERATIONAL ? 'healthy' : 'unhealthy',
          ...status
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    
    server.listen(port, () => {
      console.error(`MCPWrapper: Health endpoint listening on port ${port}`);
    });
  }
}

module.exports = MCPServerWrapper;