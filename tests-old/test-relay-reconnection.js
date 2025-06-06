#!/usr/bin/env node

/**
 * Test Relay Reconnection Behavior
 * 
 * This test verifies that the Chrome extension properly reconnects
 * to the relay after periods of inactivity or disconnection.
 */

const WebSocket = require('ws');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const RELAY_PORT = 54321;

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Simple test relay that can be started/stopped
class TestRelay {
  constructor(port = RELAY_PORT) {
    this.port = port;
    this.server = null;
    this.clients = new Set();
  }
  
  async start() {
    return new Promise((resolve, reject) => {
      this.server = new WebSocket.Server({ port: this.port });
      
      this.server.on('listening', () => {
        console.log(`${colors.green}✓ Test relay started on port ${this.port}${colors.reset}`);
        resolve();
      });
      
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`${colors.yellow}⚠ Port ${this.port} already in use (likely real relay running)${colors.reset}`);
          reject(new Error('Port in use'));
        } else {
          reject(error);
        }
      });
      
      this.server.on('connection', (ws) => {
        console.log(`${colors.cyan}→ Client connected${colors.reset}`);
        this.clients.add(ws);
        
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            console.log(`${colors.cyan}← Received: ${message.type}${colors.reset}`);
            
            // Echo back for testing
            if (message.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
          } catch (error) {
            console.error('Invalid message:', data);
          }
        });
        
        ws.on('close', () => {
          console.log(`${colors.cyan}← Client disconnected${colors.reset}`);
          this.clients.delete(ws);
        });
      });
    });
  }
  
  async stop() {
    if (this.server) {
      // Close all client connections
      for (const client of this.clients) {
        client.close();
      }
      
      // Close server
      await new Promise((resolve) => {
        this.server.close(() => {
          console.log(`${colors.red}✓ Test relay stopped${colors.reset}`);
          resolve();
        });
      });
      
      this.server = null;
      this.clients.clear();
    }
  }
  
  getClientCount() {
    return this.clients.size;
  }
}

// Test scenarios
async function runReconnectionTests() {
  console.log(`${colors.blue}🧪 Relay Reconnection Tests${colors.reset}\n`);
  
  const relay = new TestRelay();
  let testsPassed = 0;
  let testsFailed = 0;
  
  async function test(name, fn) {
    console.log(`\n${colors.cyan}▶ ${name}${colors.reset}`);
    try {
      await fn();
      console.log(`${colors.green}✅ PASSED${colors.reset}`);
      testsPassed++;
    } catch (error) {
      console.log(`${colors.red}❌ FAILED: ${error.message}${colors.reset}`);
      testsFailed++;
    }
  }
  
  // Test 1: Basic relay operation
  await test('Basic relay start/stop', async () => {
    try {
      await relay.start();
      await sleep(1000);
      await relay.stop();
    } catch (error) {
      if (error.message === 'Port in use') {
        console.log('  Real relay is running - skipping relay simulation tests');
        throw new Error('Cannot test - real relay is running');
      }
      throw error;
    }
  });
  
  // Test 2: Client connection simulation
  await test('Client connection and disconnection', async () => {
    await relay.start();
    
    // Simulate extension connection
    const client = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}`);
    
    await new Promise((resolve, reject) => {
      client.on('open', () => {
        console.log('  Client connected successfully');
        resolve();
      });
      client.on('error', reject);
    });
    
    // Verify client count
    if (relay.getClientCount() !== 1) {
      throw new Error('Client count mismatch');
    }
    
    // Test ping/pong
    const pongReceived = new Promise((resolve) => {
      client.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'pong') {
          resolve();
        }
      });
    });
    
    client.send(JSON.stringify({ type: 'ping' }));
    await pongReceived;
    console.log('  Ping/pong successful');
    
    // Disconnect
    client.close();
    await sleep(100);
    
    if (relay.getClientCount() !== 0) {
      throw new Error('Client not properly disconnected');
    }
    
    await relay.stop();
  });
  
  // Test 3: Reconnection after relay restart
  await test('Reconnection after relay restart', async () => {
    await relay.start();
    
    // Connect client
    let client = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}`);
    await new Promise((resolve) => client.on('open', resolve));
    console.log('  Initial connection established');
    
    // Stop hub (simulate crash/restart)
    await relay.stop();
    await sleep(1000);
    
    // Client should be disconnected
    if (client.readyState === WebSocket.OPEN) {
      throw new Error('Client still shows as connected');
    }
    
    // Restart relay
    await relay.start();
    console.log('  Relay restarted');
    
    // Try to reconnect
    client = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}`);
    await new Promise((resolve, reject) => {
      client.on('open', () => {
        console.log('  Reconnection successful');
        resolve();
      });
      client.on('error', reject);
    });
    
    client.close();
    await relay.stop();
  });
  
  // Test 4: Multiple reconnection attempts
  await test('Multiple reconnection attempts', async () => {
    let reconnectCount = 0;
    const maxReconnects = 3;
    
    async function attemptConnection() {
      return new Promise((resolve, reject) => {
        const client = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}`);
        const timeout = setTimeout(() => {
          client.terminate();
          reject(new Error('Connection timeout'));
        }, 1000);
        
        client.on('open', () => {
          clearTimeout(timeout);
          console.log(`  Reconnect attempt ${reconnectCount + 1} successful`);
          reconnectCount++;
          client.close();
          resolve();
        });
        
        client.on('error', () => {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        });
      });
    }
    
    // Start relay
    await relay.start();
    
    // Multiple connect/disconnect cycles
    for (let i = 0; i < maxReconnects; i++) {
      await attemptConnection();
      await sleep(500);
    }
    
    if (reconnectCount !== maxReconnects) {
      throw new Error(`Only ${reconnectCount} of ${maxReconnects} reconnections succeeded`);
    }
    
    await relay.stop();
  });
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log(`${colors.blue}📊 Test Summary${colors.reset}`);
  console.log('='.repeat(50));
  console.log(`${colors.green}✅ Passed: ${testsPassed}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${testsFailed}${colors.reset}`);
  
  if (testsFailed === 0) {
    console.log(`\n${colors.green}✨ All reconnection tests passed!${colors.reset}`);
  } else {
    console.log(`\n${colors.red}⚠️  Some tests failed${colors.reset}`);
  }
  
  // Cleanup
  await relay.stop().catch(() => {});
  
  return testsFailed === 0;
}

// Instructions for manual testing
function printManualTestInstructions() {
  console.log('\n' + '='.repeat(50));
  console.log(`${colors.yellow}📝 Manual Testing Instructions${colors.reset}`);
  console.log('='.repeat(50));
  console.log('\n1. Start Claude Code (ensures MCP server and relay are running)');
  console.log('2. Open Chrome extension popup - verify relay shows as connected');
  console.log('3. Wait 5-10 minutes without using the extension');
  console.log('4. Open popup again - it should either:');
  console.log('   a) Show as connected (auto-reconnected)');
  console.log('   b) Show reconnect button - click to reconnect');
  console.log('5. Verify clients list shows Claude Code connection');
  console.log('\nTo test with this script:');
  console.log('- Stop Claude Code first');
  console.log('- Run this test script');
  console.log('- Script will simulate relay start/stop/reconnection');
}

// Run tests
if (require.main === module) {
  runReconnectionTests()
    .then(success => {
      printManualTestInstructions();
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      printManualTestInstructions();
      process.exit(2);
    });
}

module.exports = { TestRelay, runReconnectionTests };