#!/usr/bin/env node

/**
 * Test suite for MCP server lifecycle management and restart capabilities
 */

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

class LifecycleTestSuite extends EventEmitter {
  constructor() {
    super();
    this.serverWrapperPath = path.join(__dirname, '../mcp-server/src/server-wrapper.js');
    this.testResults = [];
    this.activeProcesses = [];
  }

  async runAllTests() {
    console.error('🧪 Starting MCP Server Lifecycle Test Suite');
    console.error('=' .repeat(60));

    const tests = [
      { name: 'Basic Server Start/Stop', fn: () => this.testBasicStartStop() },
      { name: 'Graceful Shutdown', fn: () => this.testGracefulShutdown() },
      { name: 'Server Crash Recovery', fn: () => this.testCrashRecovery() },
      { name: 'Multiple Restart Cycles', fn: () => this.testMultipleRestarts() },
      { name: 'Health Check Monitoring', fn: () => this.testHealthChecking() },
      { name: 'Max Restart Limit', fn: () => this.testMaxRestartLimit() },
      { name: 'Process Cleanup', fn: () => this.testProcessCleanup() }
    ];

    for (const test of tests) {
      await this.runTest(test.name, test.fn);
    }

    this.printSummary();
    await this.cleanup();
  }

  async runTest(name, testFn) {
    const startTime = Date.now();
    console.error(`\n🔄 Running: ${name}`);
    
    try {
      const result = await Promise.race([
        testFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), 30000)
        )
      ]);
      
      const duration = Date.now() - startTime;
      console.error(`✅ PASSED: ${name} (${duration}ms)`);
      this.testResults.push({ name, status: 'PASSED', duration, error: null });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ FAILED: ${name} (${duration}ms)`);
      console.error(`   Error: ${error.message}`);
      this.testResults.push({ name, status: 'FAILED', duration, error: error.message });
    }
  }

  async testBasicStartStop() {
    const server = await this.spawnServer();
    await this.waitForServerReady(server, 5000);
    await this.stopServer(server, 'SIGTERM');
    return true;
  }

  async testGracefulShutdown() {
    const server = await this.spawnServer();
    await this.waitForServerReady(server, 5000);
    
    // Send stdin close to trigger graceful shutdown
    server.stdin.end();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Graceful shutdown timeout'));
      }, 35000); // 30s + buffer
      
      server.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`Non-zero exit code: ${code}`));
        }
      });
    });
  }

  async testCrashRecovery() {
    const server = await this.spawnServer({ restartEnabled: true, maxRestarts: 3 });
    await this.waitForServerReady(server, 5000);
    
    // Force crash the server
    server.kill('SIGKILL');
    
    // Wait for restart
    await this.waitForLog(server, 'Server restarted', 10000);
    
    await this.stopServer(server, 'SIGTERM');
    return true;
  }

  async testMultipleRestarts() {
    const server = await this.spawnServer({ restartEnabled: true, maxRestarts: 5 });
    await this.waitForServerReady(server, 5000);
    
    // Crash and restart 3 times
    for (let i = 0; i < 3; i++) {
      console.error(`   Crash cycle ${i + 1}/3`);
      server.kill('SIGKILL');
      await this.waitForLog(server, 'Server restarted', 10000);
    }
    
    await this.stopServer(server, 'SIGTERM');
    return true;
  }

  async testHealthChecking() {
    const server = await this.spawnServer({ 
      restartEnabled: true,
      healthCheckInterval: 2000 
    });
    await this.waitForServerReady(server, 5000);
    
    // Wait for health checks to occur
    await this.waitForLog(server, 'Health check', 10000);
    
    await this.stopServer(server, 'SIGTERM');
    return true;
  }

  async testMaxRestartLimit() {
    const server = await this.spawnServer({ 
      restartEnabled: true, 
      maxRestarts: 2,
      restartDelay: 500 
    });
    await this.waitForServerReady(server, 5000);
    
    // Crash more times than allowed
    for (let i = 0; i < 3; i++) {
      server.kill('SIGKILL');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Wait for final exit
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server did not exit after max restarts'));
      }, 10000);
      
      server.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          resolve(true); // Expected to exit with error
        } else {
          reject(new Error('Server should exit with error after max restarts'));
        }
      });
    });
  }

  async testProcessCleanup() {
    const server = await this.spawnServer();
    const pid = server.pid;
    
    await this.waitForServerReady(server, 5000);
    await this.stopServer(server, 'SIGTERM');
    
    // Verify process is actually gone
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      process.kill(pid, 0); // Check if process exists
      throw new Error('Process still exists after shutdown');
    } catch (error) {
      if (error.code === 'ESRCH') {
        return true; // Process properly cleaned up
      }
      throw error;
    }
  }

  async spawnServer(options = {}) {
    const env = {
      ...process.env,
      MCP_RESTART_ENABLED: options.restartEnabled !== false ? 'true' : 'false',
      MCP_MAX_RESTARTS: (options.maxRestarts || 5).toString(),
      MCP_RESTART_DELAY: (options.restartDelay || 2000).toString(),
      MCP_HEALTH_INTERVAL: (options.healthCheckInterval || 30000).toString()
    };

    const server = spawn('node', [this.serverWrapperPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    });

    this.activeProcesses.push(server);

    server.logs = [];
    
    server.stderr.on('data', (data) => {
      const log = data.toString().trim();
      server.logs.push(log);
      if (process.env.VERBOSE_TESTS) {
        console.error(`   [${server.pid}] ${log}`);
      }
    });

    server.on('error', (error) => {
      console.error(`   Server error: ${error.message}`);
    });

    return server;
  }

  async waitForServerReady(server, timeout = 10000) {
    return this.waitForLog(server, 'Server started', timeout);
  }

  async waitForLog(server, pattern, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for log pattern: ${pattern}`));
      }, timeout);

      const checkLogs = () => {
        const found = server.logs.some(log => log.includes(pattern));
        if (found) {
          clearTimeout(timer);
          resolve(true);
        }
      };

      // Check existing logs
      checkLogs();

      // Listen for new logs
      const onData = () => checkLogs();
      server.stderr.on('data', onData);

      // Cleanup
      const originalResolve = resolve;
      resolve = (...args) => {
        server.stderr.removeListener('data', onData);
        originalResolve(...args);
      };
    });
  }

  async stopServer(server, signal = 'SIGTERM') {
    return new Promise((resolve) => {
      server.on('exit', () => resolve());
      server.kill(signal);
    });
  }

  async cleanup() {
    console.error('\n🧹 Cleaning up test processes...');
    
    for (const process of this.activeProcesses) {
      if (!process.killed) {
        try {
          process.kill('SIGKILL');
        } catch (error) {
          // Ignore errors
        }
      }
    }
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  printSummary() {
    console.error('\n' + '='.repeat(60));
    console.error('📊 Test Summary');
    console.error('='.repeat(60));
    
    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    const total = this.testResults.length;
    
    console.error(`Total Tests: ${total}`);
    console.error(`✅ Passed: ${passed}`);
    console.error(`❌ Failed: ${failed}`);
    console.error(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.error('\nFailed Tests:');
      this.testResults
        .filter(r => r.status === 'FAILED')
        .forEach(test => {
          console.error(`  • ${test.name}: ${test.error}`);
        });
    }
    
    console.error('='.repeat(60));
  }
}

// Run tests if called directly
if (require.main === module) {
  const suite = new LifecycleTestSuite();
  
  suite.runAllTests()
    .then(() => {
      const failed = suite.testResults.filter(r => r.status === 'FAILED').length;
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Test suite error:', error);
      process.exit(1);
    });
}

module.exports = LifecycleTestSuite;