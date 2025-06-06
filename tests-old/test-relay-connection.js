#!/usr/bin/env node

/**
 * Test relay connection with multiple MCP servers
 */

const WebSocket = require('ws');

async function testRelayConnection() {
  console.log('🔌 Testing WebSocket Relay Connection\n');
  
  // Test 1: Check if relay is running
  console.log('1️⃣ Checking if relay is accessible...');
  
  try {
    const testWs = new WebSocket('ws://localhost:54321');
    
    await new Promise((resolve, reject) => {
      testWs.on('open', () => {
        console.log('✅ Connected to relay on port 54321');
        testWs.close();
        resolve();
      });
      
      testWs.on('error', (err) => {
        console.log('❌ Could not connect to relay:', err.message);
        reject(err);
      });
      
      setTimeout(() => {
        testWs.close();
        reject(new Error('Connection timeout'));
      }, 5000);
    });
    
  } catch (error) {
    console.error('Relay connection test failed:', error.message);
  }
  
  // Test 2: Try to register as a new MCP server
  console.log('\n2️⃣ Testing registration as new MCP server...');
  
  try {
    const ws = new WebSocket('ws://localhost:54321');
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('✅ Connected to relay');
        
        // Register as a new MCP server
        const registration = {
          type: 'register',
          clientId: 'test-mcp-server-' + Date.now(),
          clientInfo: {
            name: 'Test MCP Server',
            type: 'mcp-server'
          }
        };
        
        ws.send(JSON.stringify(registration));
        console.log('📤 Sent registration:', registration);
      });
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('📥 Received:', message);
        
        if (message.type === 'registered') {
          console.log('✅ Successfully registered with relay');
          ws.close();
          resolve();
        }
      });
      
      ws.on('error', (err) => {
        console.log('❌ WebSocket error:', err.message);
        reject(err);
      });
      
      setTimeout(() => {
        ws.close();
        reject(new Error('Registration timeout'));
      }, 10000);
    });
    
  } catch (error) {
    console.error('Registration test failed:', error.message);
  }
  
  console.log('\n✅ Relay connection tests completed');
}

// Run the test
testRelayConnection().catch(console.error);