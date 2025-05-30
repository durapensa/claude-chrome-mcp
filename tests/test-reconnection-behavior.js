#!/usr/bin/env node

/**
 * Test script to verify Chrome extension reconnection behavior
 * 
 * Test scenario:
 * 1. Start MCP server (creates hub)
 * 2. Wait for extension to connect
 * 3. Kill MCP server (hub shuts down)
 * 4. Wait and observe extension reconnection attempts
 * 5. Restart MCP server (creates new hub)
 * 6. Verify extension reconnects automatically
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');

const HUB_PORT = 54321;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkHubStatus() {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${HUB_PORT}`);
    
    ws.on('open', () => {
      ws.close();
      resolve(true);
    });
    
    ws.on('error', () => {
      resolve(false);
    });
    
    setTimeout(() => resolve(false), 1000);
  });
}

async function runReconnectionTest() {
  console.log('=== Chrome Extension Reconnection Test ===\n');
  
  let mcpProcess = null;
  
  try {
    // Step 1: Start MCP server
    console.log('1. Starting MCP server...');
    mcpProcess = spawn('node', ['/Users/dp/claude-chrome-mcp/mcp-server/src/server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CCM_DEBUG: '1' }
    });
    
    mcpProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('MCP server started') || msg.includes('Started hub')) {
        console.log('   MCP:', msg.trim());
      }
    });
    
    // Wait for hub to start
    await sleep(3000);
    
    // Step 2: Check hub is running
    console.log('\n2. Checking hub status...');
    const hubRunning = await checkHubStatus();
    console.log(`   Hub is ${hubRunning ? 'running' : 'not running'}`);
    
    if (!hubRunning) {
      console.error('   Failed to start hub');
      return;
    }
    
    // Step 3: Wait for extension to connect (should already be connected)
    console.log('\n3. Extension should be connected. Check Chrome extension popup.');
    console.log('   Press Enter when extension shows connected status...');
    await new Promise(resolve => process.stdin.once('data', resolve));
    
    // Step 4: Kill MCP server
    console.log('\n4. Killing MCP server (hub will shut down)...');
    mcpProcess.kill('SIGTERM');
    await sleep(2000);
    
    // Step 5: Verify hub is down
    console.log('\n5. Verifying hub is down...');
    const hubDown = !(await checkHubStatus());
    console.log(`   Hub is ${hubDown ? 'down' : 'still running (unexpected)'}`);
    
    // Step 6: Monitor extension status
    console.log('\n6. Extension should now show disconnected status.');
    console.log('   Watch the Chrome extension popup - it should show reconnection attempts.');
    console.log('   With the fix, you should see:');
    console.log('   - Initial reconnection attempts with exponential backoff');
    console.log('   - Persistent reconnection every 30 seconds');
    console.log('   Press Enter to continue...');
    await new Promise(resolve => process.stdin.once('data', resolve));
    
    // Step 7: Restart MCP server
    console.log('\n7. Restarting MCP server...');
    mcpProcess = spawn('node', ['/Users/dp/claude-chrome-mcp/mcp-server/src/server.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CCM_DEBUG: '1' }
    });
    
    mcpProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('MCP server started') || msg.includes('Started hub')) {
        console.log('   MCP:', msg.trim());
      }
    });
    
    // Wait for hub to start
    await sleep(3000);
    
    // Step 8: Verify hub is running again
    console.log('\n8. Verifying hub is running again...');
    const hubRestored = await checkHubStatus();
    console.log(`   Hub is ${hubRestored ? 'running' : 'not running'}`);
    
    // Step 9: Wait for extension to reconnect
    console.log('\n9. Extension should reconnect automatically within 30 seconds.');
    console.log('   Watch the Chrome extension popup - it should show connected status again.');
    console.log('   WITH FIX: Extension reconnects automatically');
    console.log('   WITHOUT FIX: Extension stays disconnected, requires manual reload');
    console.log('   Press Enter when done observing...');
    await new Promise(resolve => process.stdin.once('data', resolve));
    
    console.log('\n✓ Test completed!');
    console.log('\nSummary:');
    console.log('- If extension reconnected automatically: Fix is working!');
    console.log('- If extension required manual reload: Fix needs adjustment');
    
  } catch (error) {
    console.error('\nTest error:', error);
  } finally {
    if (mcpProcess && !mcpProcess.killed) {
      console.log('\nCleaning up MCP server...');
      mcpProcess.kill('SIGTERM');
    }
  }
}

// Enable stdin for interactive test
process.stdin.setRawMode(true);
process.stdin.resume();

console.log('This test requires the Chrome extension to be loaded and visible.');
console.log('Make sure you can see the extension popup during the test.\n');
console.log('Press any key to start the test...');

process.stdin.once('data', () => {
  process.stdin.setRawMode(false);
  runReconnectionTest().then(() => process.exit(0));
});