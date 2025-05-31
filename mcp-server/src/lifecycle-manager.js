#!/usr/bin/env node

/**
 * MCP Server Lifecycle Manager
 * Implements MCP lifecycle specification requirements for restart capability
 * Based on docs/development/compass_artifact_wf-14fa80f3-dde6-46a1-be29-f2b9561653f8_text_markdown.md
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

/**
 * MCP Server States per specification:
 * - Uninitialized: Process exists but handshake incomplete
 * - Initializing: Capability negotiation in progress  
 * - Operational: Normal message exchange
 * - Disconnected: Transport lost with resumption possible
 * - Shutdown: Process terminated
 */
const ServerState = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing', 
  OPERATIONAL: 'operational',
  DISCONNECTED: 'disconnected',
  SHUTDOWN: 'shutdown'
};

class MCPLifecycleManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.serverPath = options.serverPath || path.join(__dirname, 'server.js');
    this.restartEnabled = options.restartEnabled !== false;
    this.maxRestarts = options.maxRestarts || 10;
    this.restartDelay = options.restartDelay || 1000;
    this.healthCheckInterval = options.healthCheckInterval || 30000;
    this.gracefulShutdownTimeout = options.gracefulShutdownTimeout || 30000;
    
    // State tracking
    this.state = ServerState.SHUTDOWN;
    this.process = null;
    this.restartCount = 0;
    this.lastStartTime = null;
    this.lastExitCode = null;
    this.lastExitSignal = null;
    this.isShuttingDown = false;
    this.shutdownStartTime = null;
    
    // Health monitoring
    this.healthCheckTimer = null;
    this.lastHealthCheck = null;
    this.consecutiveHealthFailures = 0;
    
    // Session continuity
    this.sessionId = null;
    this.preservedState = new Map();
    
    this.setupSignalHandlers();
  }

  /**
   * Start the MCP server with full lifecycle management
   */
  async start() {
    if (this.process && !this.process.killed) {
      throw new Error('Server already running');
    }

    try {
      await this.spawnServer();
      this.startHealthMonitoring();
      this.emit('started', { 
        pid: this.process.pid, 
        sessionId: this.sessionId,
        restartCount: this.restartCount 
      });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Spawn new server process with proper lifecycle hooks
   */
  async spawnServer() {
    return new Promise((resolve, reject) => {
      console.error(`MCPLifecycle: Starting server (attempt ${this.restartCount + 1})`);
      
      this.state = ServerState.UNINITIALIZED;
      this.lastStartTime = Date.now();
      this.sessionId = this.generateSessionId();
      
      // Spawn with stdio transport as per MCP spec
      this.process = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          MCP_SESSION_ID: this.sessionId,
          MCP_RESTART_COUNT: this.restartCount.toString()
        }
      });

      this.process.on('spawn', () => {
        console.error(`MCPLifecycle: Server spawned with PID ${this.process.pid}`);
        this.state = ServerState.INITIALIZING;
        resolve();
      });

      this.process.on('error', (error) => {
        console.error('MCPLifecycle: Process spawn error:', error);
        this.state = ServerState.SHUTDOWN;
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        this.handleProcessExit(code, signal);
      });

      // Pipe stdio for MCP protocol communication
      this.process.stdout.on('data', (data) => {
        this.emit('stdout', data);
      });

      this.process.stderr.on('data', (data) => {
        this.emit('stderr', data);
      });

      // Set timeout for initial spawn
      setTimeout(() => {
        if (this.state === ServerState.UNINITIALIZED) {
          console.error('MCPLifecycle: Server spawn timeout');
          this.terminateProcess();
          reject(new Error('Server spawn timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Handle server process exit with restart logic
   */
  handleProcessExit(code, signal) {
    this.lastExitCode = code;
    this.lastExitSignal = signal;
    
    const wasOperational = this.state === ServerState.OPERATIONAL;
    this.state = ServerState.SHUTDOWN;
    
    console.error(`MCPLifecycle: Server exited (code: ${code}, signal: ${signal})`);

    this.emit('exit', { 
      code, 
      signal, 
      wasOperational,
      restartCount: this.restartCount,
      sessionId: this.sessionId
    });

    // Stop health monitoring
    this.stopHealthMonitoring();

    // Auto-restart logic per MCP spec
    if (this.shouldRestart(code, signal)) {
      this.scheduleRestart();
    } else {
      this.emit('stopped', { 
        reason: 'max_restarts_exceeded',
        finalExitCode: code,
        totalRestarts: this.restartCount 
      });
    }
  }

  /**
   * Determine if server should restart based on exit conditions
   */
  shouldRestart(code, signal) {
    // Don't restart if manually shut down
    if (this.isShuttingDown) {
      return false;
    }

    // Don't restart if max attempts exceeded
    if (this.restartCount >= this.maxRestarts) {
      console.error(`MCPLifecycle: Max restarts (${this.maxRestarts}) exceeded`);
      return false;
    }

    // Don't restart if disabled
    if (!this.restartEnabled) {
      return false;
    }

    // Restart on crash (non-zero exit codes) or unexpected signals
    if (code !== 0 || (signal && !['SIGTERM', 'SIGINT'].includes(signal))) {
      return true;
    }

    return false;
  }

  /**
   * Schedule restart with exponential backoff
   */
  scheduleRestart() {
    const delay = Math.min(
      this.restartDelay * Math.pow(2, this.restartCount),
      30000 // Max 30 second delay
    );

    console.error(`MCPLifecycle: Scheduling restart in ${delay}ms`);
    
    setTimeout(async () => {
      if (!this.isShuttingDown) {
        this.restartCount++;
        try {
          await this.start();
          this.emit('restarted', { 
            restartCount: this.restartCount,
            sessionId: this.sessionId 
          });
        } catch (error) {
          console.error('MCPLifecycle: Restart failed:', error);
          this.emit('restart_failed', error);
        }
      }
    }, delay);
  }

  /**
   * Implement graceful shutdown per MCP spec (30s timeout)
   */
  async gracefulShutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.shutdownStartTime = Date.now();
    this.state = ServerState.DISCONNECTED;
    
    console.error('MCPLifecycle: Initiating graceful shutdown');
    this.emit('shutdown_started');

    if (!this.process || this.process.killed) {
      this.emit('shutdown_complete');
      return;
    }

    try {
      // Step 1: Close stdin to signal shutdown (MCP stdio transport)
      if (this.process.stdin && !this.process.stdin.destroyed) {
        this.process.stdin.end();
      }

      // Step 2: Wait for graceful exit
      const gracefulExitPromise = new Promise((resolve) => {
        const onExit = () => {
          this.process.removeListener('exit', onExit);
          resolve();
        };
        this.process.on('exit', onExit);
      });

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(resolve, this.gracefulShutdownTimeout);
      });

      await Promise.race([gracefulExitPromise, timeoutPromise]);

      // Step 3: Force termination if still running
      if (!this.process.killed) {
        console.error('MCPLifecycle: Graceful shutdown timeout, sending SIGTERM');
        this.process.kill('SIGTERM');
        
        // Final timeout for SIGKILL
        setTimeout(() => {
          if (!this.process.killed) {
            console.error('MCPLifecycle: SIGTERM timeout, sending SIGKILL');
            this.process.kill('SIGKILL');
          }
        }, 5000);
      }

      const shutdownDuration = Date.now() - this.shutdownStartTime;
      console.error(`MCPLifecycle: Graceful shutdown completed in ${shutdownDuration}ms`);
      this.emit('shutdown_complete', { duration: shutdownDuration });

    } catch (error) {
      console.error('MCPLifecycle: Error during graceful shutdown:', error);
      this.emit('shutdown_error', error);
    }
  }

  /**
   * Start health monitoring per MCP best practices
   */
  startHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health check on server process
   */
  performHealthCheck() {
    this.lastHealthCheck = Date.now();

    if (!this.process || this.process.killed) {
      this.consecutiveHealthFailures++;
      this.emit('health_check_failed', { 
        reason: 'process_not_running',
        failures: this.consecutiveHealthFailures 
      });
      return;
    }

    // Check if process is responsive (basic check)
    try {
      process.kill(this.process.pid, 0); // Signal 0 tests if process exists
      this.consecutiveHealthFailures = 0;
      this.emit('health_check_passed', { pid: this.process.pid });
      
      if (this.state === ServerState.INITIALIZING) {
        // Could add initialization timeout logic here
      }
      
    } catch (error) {
      this.consecutiveHealthFailures++;
      this.emit('health_check_failed', { 
        reason: 'process_unresponsive',
        error: error.message,
        failures: this.consecutiveHealthFailures 
      });
    }
  }

  /**
   * Set server state (for external state management)
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.emit('state_changed', { from: oldState, to: newState });
  }

  /**
   * Generate unique session ID for state continuity
   */
  generateSessionId() {
    return `mcp-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Preserve state for session continuity across restarts
   */
  preserveState(key, value) {
    this.preservedState.set(key, {
      value,
      timestamp: Date.now(),
      sessionId: this.sessionId
    });
  }

  /**
   * Restore preserved state from previous session
   */
  restoreState(key) {
    const preserved = this.preservedState.get(key);
    if (preserved && preserved.sessionId) {
      return preserved.value;
    }
    return null;
  }

  /**
   * Clear expired state entries
   */
  cleanupPreservedState(maxAge = 300000) { // 5 minutes default
    const now = Date.now();
    for (const [key, entry] of this.preservedState.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.preservedState.delete(key);
      }
    }
  }

  /**
   * Terminate process forcefully
   */
  terminateProcess() {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGKILL');
    }
  }

  /**
   * Setup signal handlers for lifecycle management
   */
  setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.error(`MCPLifecycle: Received ${signal}, shutting down`);
        await this.gracefulShutdown();
        process.exit(0);
      });
    });
  }

  /**
   * Get current server status
   */
  getStatus() {
    return {
      state: this.state,
      pid: this.process?.pid || null,
      restartCount: this.restartCount,
      lastStartTime: this.lastStartTime,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
      sessionId: this.sessionId,
      isShuttingDown: this.isShuttingDown,
      lastHealthCheck: this.lastHealthCheck,
      consecutiveHealthFailures: this.consecutiveHealthFailures,
      uptime: this.lastStartTime ? Date.now() - this.lastStartTime : 0
    };
  }
}

module.exports = { MCPLifecycleManager, ServerState };