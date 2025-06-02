// Enhanced process lifecycle management with better shutdown handling
// This handles all process-level lifecycle events and graceful shutdown
class ProcessLifecycleManager {
  constructor() {
    this.isShuttingDown = false;
    this.shutdownPromise = null;
    this.shutdownTimeoutMs = 2000; // Reduced for faster exit
    this.forceExitTimeoutMs = 100; // Much faster force exit
    this.parentPid = process.ppid;
    this.parentCheckInterval = null;
    this.cleanupTasks = [];
    this.lastParentCheck = Date.now();
    this.lastActivityTime = Date.now();
    this.shutdownReason = null;
    this.allIntervals = []; // Track all intervals for cleanup
    
    // Health monitoring properties (Fix 4)
    this.lastClaudeCodeHeartbeat = Date.now();
    this.heartbeatInterval = null;
    this.HEARTBEAT_TIMEOUT = 120000; // 2 minutes
    this.HEARTBEAT_INTERVAL = 30000; // 30 seconds
    
    this.setupSignalHandlers();
    this.setupParentMonitoring();
    this.setupOrphanDetection();
    this.startHealthMonitoring(); // Fix 4: Start health monitoring
  }

  addCleanupTask(name, cleanupFn) {
    this.cleanupTasks.push({ name, cleanupFn });
  }

  addInterval(intervalId, name = 'unnamed') {
    this.allIntervals.push({ id: intervalId, name });
    return intervalId;
  }

  clearAllIntervals() {
    for (const interval of this.allIntervals) {
      clearInterval(interval.id);
    }
    this.allIntervals = [];
  }

  setupSignalHandlers() {
    // Handle SIGPIPE separately - it's not a shutdown signal
    process.on('SIGPIPE', () => {
      console.error('CCM: Received SIGPIPE, stdout likely closed - continuing operation');
      // Don't shutdown on SIGPIPE, just note it
    });

    // Real shutdown signals
    const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    shutdownSignals.forEach(signal => {
      process.on(signal, async () => {
        console.error(`CCM: Received ${signal}, initiating graceful shutdown`);
        await this.gracefulShutdown(`signal:${signal}`);
      });
    });

    // Handle parent process disconnect
    process.on('disconnect', async () => {
      console.error('CCM: Parent process disconnected');
      await this.gracefulShutdown('parent_disconnect');
    });

    // Handle uncaught exceptions with immediate exit
    process.on('uncaughtException', (error) => {
      console.error('CCM: Uncaught exception:', error);
      this.emergencyShutdown('uncaught_exception');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('CCM: Unhandled rejection:', reason);
      // Log but don't exit on unhandled rejections
    });
  }

  setupParentMonitoring() {
    if (this.parentPid && this.parentPid !== 1) {
      this.parentCheckInterval = this.addInterval(setInterval(() => {
        this.checkParentProcess();
      }, 30000), 'parentCheck'); // Check every 30 seconds instead of 1 second
    }

    if (process.env.CCM_PARENT_PID) {
      const envParentPid = parseInt(process.env.CCM_PARENT_PID);
      if (envParentPid && envParentPid !== this.parentPid) {
        console.warn(`CCM: ENV parent PID (${envParentPid}) differs from process parent PID (${this.parentPid})`);
        this.parentPid = envParentPid;
      }
    }

    // Enhanced stdin monitoring for MCP protocol
    if (process.stdin.isTTY === false) {
      let stdinClosed = false;
      
      // DISABLED: Aggressive stdin monitoring was causing premature shutdowns
      // Many environments have unpredictable stdin behavior - only log, don't shutdown
      process.stdin.on('end', async () => {
        if (!stdinClosed) {
          stdinClosed = true;
          console.warn('CCM: stdin closed - but continuing operation');
          // DISABLED: await this.gracefulShutdown('stdin_closed');
        }
      });

      process.stdin.on('error', async (error) => {
        if (!stdinClosed) {
          stdinClosed = true;
          if (error.code === 'EPIPE') {
            console.warn('CCM: stdin EPIPE error - but continuing operation');
            // DISABLED: await this.gracefulShutdown('stdin_epipe');
          } else {
            console.warn('CCM: stdin error - but continuing operation:', error);
            // DISABLED: await this.gracefulShutdown('stdin_error');
          }
        }
      });

      process.stdin.on('close', async () => {
        if (!stdinClosed) {
          stdinClosed = true;
          console.warn('CCM: stdin closed (close event) - but continuing operation');
          // DISABLED: await this.gracefulShutdown('stdin_close_event');
        }
      });

      // Keep stdin active to detect when it closes
      process.stdin.resume();
      
      // Add a data handler to detect actual stdin activity
      process.stdin.on('data', (chunk) => {
        this.updateActivity();
        // If we receive any data, it means the parent is still active
      });
    }
  }

  setupOrphanDetection() {
    // DISABLED: Aggressive orphan detection was causing premature shutdowns
    // Only detect true orphaning (ppid === 1) without idle timeouts
    const checkOrphanStatus = () => {
      if (process.ppid === 1 && this.parentPid !== 1) {
        console.error('CCM: Process orphaned (parent PID is now 1)');
        this.gracefulShutdown('orphaned');
        return;
      }

      // DISABLED: Idle timeout logic - let the process run indefinitely
      // const maxIdleTime = parseInt(process.env.CCM_MAX_IDLE_TIME || '300000');
      // if (maxIdleTime > 0) {
      //   const timeSinceLastActivity = Date.now() - this.lastActivityTime;
      //   if (timeSinceLastActivity > maxIdleTime) {
      //     console.error(`CCM: No activity for ${timeSinceLastActivity}ms, shutting down`);
      //     this.gracefulShutdown('max_idle_time');
      //   }
      // }
    };

    // Check less frequently to reduce system load
    this.addInterval(setInterval(checkOrphanStatus, 60000), 'orphanCheck'); // Every 60s instead of 10s
  }

  checkParentProcess() {
    // DISABLED: Aggressive parent checking was causing false positives and premature shutdowns
    // Parent process monitoring should be handled by actual disconnect events, not polling
    try {
      if (this.parentPid && this.parentPid !== 1) {
        process.kill(this.parentPid, 0);
        this.lastParentCheck = Date.now();
        console.log(`CCM: Parent process ${this.parentPid} still alive`);
      }
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.warn(`CCM: Parent process ${this.parentPid} no longer exists - but not shutting down`);
        // DISABLED: Don't shutdown on parent check failure
        // this.gracefulShutdown('parent_dead');
      } else if (error.code === 'EPERM') {
        console.warn(`CCM: Cannot signal parent process ${this.parentPid} (permission denied)`);
      } else {
        console.error('CCM: Error checking parent process:', error);
      }
    }
  }

  updateActivity() {
    this.lastActivityTime = Date.now();
  }

  // Health monitoring methods (Fix 4) - DISABLED: Reduced frequency to avoid aggressive checks
  startHealthMonitoring() {
    // DISABLED: Aggressive health monitoring was causing stability issues
    // Only log health status, don't take action
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeatToClaudeCode();
      // DISABLED: Don't check health aggressively
      // this.checkClaudeCodeHealth();
    }, this.HEARTBEAT_INTERVAL * 4); // 4x less frequent
    
    // Add to tracked intervals for cleanup
    this.addInterval(this.heartbeatInterval, 'health-monitoring');
  }

  sendHeartbeatToClaudeCode() {
    try {
      // Send heartbeat via stdout (Claude Code will respond with MCP messages)
      // For now, just log that we're checking health
      console.error(`CCM: Health check - last heartbeat ${Date.now() - this.lastClaudeCodeHeartbeat}ms ago`);
    } catch (error) {
      console.error('CCM: Failed to send heartbeat:', error);
    }
  }

  checkClaudeCodeHealth() {
    const timeSinceLastHeartbeat = Date.now() - this.lastClaudeCodeHeartbeat;
    
    if (timeSinceLastHeartbeat > this.HEARTBEAT_TIMEOUT) {
      console.error(`CCM: Claude Code appears unresponsive (${timeSinceLastHeartbeat}ms since last activity)`);
      // For now, just log - don't shutdown as activity tracking via MCP calls is sufficient
      // this.emergencyShutdown('claude_code_unresponsive');
    }
  }

  updateHeartbeat() {
    this.lastClaudeCodeHeartbeat = Date.now();
    this.updateActivity(); // Also update general activity
  }

  stopHealthMonitoring() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async gracefulShutdown(reason = 'unknown') {
    // Prevent multiple simultaneous shutdowns
    if (this.isShuttingDown) {
      console.error(`CCM: Shutdown already in progress (original: ${this.shutdownReason}, new: ${reason})`);
      return this.shutdownPromise;
    }

    console.error(`CCM: Graceful shutdown initiated (reason: ${reason})`);
    this.isShuttingDown = true;
    this.shutdownReason = reason;

    this.shutdownPromise = this.performShutdown(reason);
    return this.shutdownPromise;
  }

  async performShutdown(reason) {
    const shutdownStart = Date.now();
    
    try {
      // Clear all intervals immediately
      console.error('CCM: Clearing all intervals...');
      this.stopHealthMonitoring(); // Fix 4: Stop health monitoring explicitly
      this.clearAllIntervals();

      // Stop stdin monitoring to prevent keeping process alive
      try {
        process.stdin.pause();
        process.stdin.removeAllListeners();
        process.stdin.destroy();
      } catch (e) {
        // Ignore errors destroying stdin
      }

      // Remove all signal handlers to prevent interference
      try {
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.removeAllListeners('SIGQUIT');
        process.removeAllListeners('disconnect');
      } catch (e) {
        // Ignore errors removing listeners
      }

      // Run cleanup tasks with aggressive timeout
      const cleanupPromises = this.cleanupTasks.map(async ({ name, cleanupFn }) => {
        try {
          console.error(`CCM: Running cleanup task: ${name}`);
          await Promise.race([
            cleanupFn(),
            new Promise(resolve => setTimeout(resolve, 500)) // 500ms max per task
          ]);
          console.error(`CCM: Cleanup task completed: ${name}`);
        } catch (error) {
          console.error(`CCM: Cleanup task failed: ${name}`, error);
        }
      });

      // Wait for cleanup with very short timeout
      await Promise.race([
        Promise.all(cleanupPromises),
        new Promise(resolve => setTimeout(resolve, this.shutdownTimeoutMs))
      ]);

      const shutdownDuration = Date.now() - shutdownStart;
      console.error(`CCM: Graceful shutdown completed in ${shutdownDuration}ms (reason: ${reason})`);
      
      // Force immediate exit
      setImmediate(() => {
        process.exit(0);
      });
      
    } catch (error) {
      console.error('CCM: Error during graceful shutdown:', error);
      // Force exit immediately on any error
      process.exit(1);
    }
  }

  emergencyShutdown(reason = 'unknown') {
    console.error(`CCM: Emergency shutdown initiated (reason: ${reason})`);
    
    // Clear any remaining intervals immediately
    try {
      this.clearAllIntervals();
    } catch (e) {
      // Ignore errors
    }
    
    // Remove all event listeners
    try {
      process.removeAllListeners();
    } catch (e) {
      // Ignore errors
    }
    
    // Force exit immediately - no delay
    console.error('CCM: Force exit');
    process.exit(1);
  }

  startHeartbeat(intervalMs = 30000) {
    setInterval(() => {
      this.updateActivity();
    }, intervalMs);
  }
}

module.exports = { ProcessLifecycleManager };