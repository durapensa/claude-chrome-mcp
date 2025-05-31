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
    
    this.setupSignalHandlers();
    this.setupParentMonitoring();
    this.setupOrphanDetection();
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
      
      process.stdin.on('end', async () => {
        if (!stdinClosed) {
          stdinClosed = true;
          console.error('CCM: stdin closed');
          await this.gracefulShutdown('stdin_closed');
        }
      });

      process.stdin.on('error', async (error) => {
        if (!stdinClosed) {
          stdinClosed = true;
          console.error('CCM: stdin error:', error.message);
          await this.gracefulShutdown('stdin_error');
        }
      });
    }
  }

  setupOrphanDetection() {
    // Check for orphan status on startup
    if (this.parentPid === 1) {
      console.error('CCM: Started as orphan process (parent PID = 1), will exit');
      this.emergencyShutdown('orphan_start');
      return;
    }

    // Periodic orphan check
    this.addInterval(setInterval(() => {
      if (process.ppid === 1 && this.parentPid !== 1) {
        console.error('CCM: Became orphan process, initiating shutdown');
        this.gracefulShutdown('orphan_detected');
      }
    }, 60000), 'orphanCheck'); // Check every minute
  }

  updateActivity() {
    this.lastActivityTime = Date.now();
  }

  checkParentProcess() {
    this.lastParentCheck = Date.now();
    
    if (!this.parentPid || this.parentPid === 1) return;

    try {
      // Check if parent process still exists
      process.kill(this.parentPid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.error(`CCM: Parent process ${this.parentPid} no longer exists`);
        this.gracefulShutdown('parent_dead');
      }
    }
  }

  async gracefulShutdown(reason) {
    if (this.isShuttingDown) {
      console.error(`CCM: Already shutting down (reason: ${this.shutdownReason}), ignoring new reason: ${reason}`);
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    this.shutdownReason = reason;
    console.error(`CCM: Starting graceful shutdown (reason: ${reason})`);

    this.shutdownPromise = this._performShutdown();
    return this.shutdownPromise;
  }

  async _performShutdown() {
    const shutdownStart = Date.now();

    try {
      // Clear all intervals first
      this.clearAllIntervals();

      // Run cleanup tasks with timeout
      const cleanupPromises = this.cleanupTasks.map(async (task) => {
        try {
          console.error(`CCM: Running cleanup task: ${task.name}`);
          await Promise.race([
            task.cleanupFn(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Cleanup timeout')), 1000)
            )
          ]);
          console.error(`CCM: Cleanup task completed: ${task.name}`);
        } catch (error) {
          console.error(`CCM: Cleanup task failed: ${task.name}:`, error.message);
        }
      });

      await Promise.allSettled(cleanupPromises);

      const shutdownDuration = Date.now() - shutdownStart;
      console.error(`CCM: Graceful shutdown completed in ${shutdownDuration}ms`);
      
      // Use setTimeout for async exit to avoid blocking
      setTimeout(() => {
        console.error('CCM: Process exiting cleanly');
        process.exit(0);
      }, this.forceExitTimeoutMs);

    } catch (error) {
      console.error('CCM: Error during graceful shutdown:', error);
      this.emergencyShutdown('shutdown_error');
    }
  }

  emergencyShutdown(reason) {
    console.error(`CCM: Emergency shutdown (reason: ${reason})`);
    this.clearAllIntervals();
    
    // Force exit immediately for emergency cases
    setTimeout(() => {
      console.error('CCM: Force exiting process');
      process.exit(1);
    }, 50); // Very short timeout for emergency exit
  }
}

module.exports = { ProcessLifecycleManager };