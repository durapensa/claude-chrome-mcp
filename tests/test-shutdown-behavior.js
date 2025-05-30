#!/usr/bin/env node

/**
 * Test script to verify MCP server shutdown behavior
 * Tests various shutdown scenarios to ensure clean exit
 */

const { spawn } = require('child_process');
const path = require('path');

const MCP_SERVER_PATH = path.join(__dirname, '../mcp-server/src/server.js');

console.log('=== MCP Server Shutdown Behavior Test ===\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testScenario(name, testFn) {
  console.log(`\nTest: ${name}`);
  console.log('-'.repeat(50));
  
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    console.log(`✅ Test passed (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ Test failed (${duration}ms): ${error.message}`);
  }
}

async function spawnMCPServer(env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [MCP_SERVER_PATH], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let hasStarted = false;
    const startTimeout = setTimeout(() => {
      if (!hasStarted) {
        child.kill('SIGTERM');
        reject(new Error('Server failed to start within 5 seconds'));
      }
    }, 5000);

    child.stderr.on('data', (data) => {
      const message = data.toString();
      process.stderr.write(`[MCP] ${message}`);
      
      if (message.includes('MCP server started') && !hasStarted) {
        hasStarted = true;
        clearTimeout(startTimeout);
        resolve(child);
      }
    });

    child.on('error', (error) => {
      clearTimeout(startTimeout);
      reject(error);
    });
  });
}

async function waitForExit(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let exited = false;
    
    const timeout = setTimeout(() => {
      if (!exited) {
        reject(new Error(`Process did not exit within ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.on('exit', (code, signal) => {
      exited = true;
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function runTests() {
  // Test 1: Clean shutdown with SIGTERM
  await testScenario('SIGTERM shutdown', async () => {
    const child = await spawnMCPServer();
    await sleep(1000); // Let it stabilize
    
    console.log('Sending SIGTERM...');
    child.kill('SIGTERM');
    
    const { code, signal } = await waitForExit(child);
    console.log(`Process exited with code: ${code}, signal: ${signal}`);
    
    if (code !== 0) {
      throw new Error(`Expected exit code 0, got ${code}`);
    }
  });

  // Test 2: Clean shutdown with SIGINT (Ctrl+C)
  await testScenario('SIGINT shutdown (Ctrl+C)', async () => {
    const child = await spawnMCPServer();
    await sleep(1000);
    
    console.log('Sending SIGINT...');
    child.kill('SIGINT');
    
    const { code, signal } = await waitForExit(child);
    console.log(`Process exited with code: ${code}, signal: ${signal}`);
    
    if (code !== 0) {
      throw new Error(`Expected exit code 0, got ${code}`);
    }
  });

  // Test 3: Stdin close shutdown
  await testScenario('stdin close shutdown', async () => {
    const child = await spawnMCPServer();
    await sleep(1000);
    
    console.log('Closing stdin...');
    child.stdin.end();
    
    const { code, signal } = await waitForExit(child);
    console.log(`Process exited with code: ${code}, signal: ${signal}`);
    
    if (code !== 0) {
      throw new Error(`Expected exit code 0, got ${code}`);
    }
  });

  // Test 4: Multiple clients connecting
  await testScenario('Multiple MCP servers can coexist', async () => {
    console.log('Starting first MCP server...');
    const child1 = await spawnMCPServer({ CCM_CLIENT_ID: 'test-client-1' });
    await sleep(1000);
    
    console.log('Starting second MCP server...');
    const child2 = await spawnMCPServer({ CCM_CLIENT_ID: 'test-client-2' });
    await sleep(1000);
    
    console.log('Both servers running. Shutting down first server...');
    child1.kill('SIGTERM');
    await waitForExit(child1);
    
    console.log('First server exited. Second server should still be running.');
    await sleep(1000);
    
    console.log('Shutting down second server...');
    child2.kill('SIGTERM');
    await waitForExit(child2);
    
    console.log('Both servers shut down successfully.');
  });

  // Test 5: Quick restart scenario
  await testScenario('Quick restart', async () => {
    console.log('Starting first instance...');
    const child1 = await spawnMCPServer();
    await sleep(1000);
    
    console.log('Killing first instance...');
    child1.kill('SIGTERM');
    await waitForExit(child1);
    
    console.log('Starting second instance immediately...');
    const child2 = await spawnMCPServer();
    await sleep(1000);
    
    console.log('Second instance started successfully. Shutting down...');
    child2.kill('SIGTERM');
    await waitForExit(child2);
  });

  console.log('\n=== All tests completed ===\n');
}

// Run tests
runTests().catch((error) => {
  console.error('\nTest suite failed:', error);
  process.exit(1);
});