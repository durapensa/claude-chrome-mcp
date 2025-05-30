#!/usr/bin/env node

const WebSocket = require('ws');

const HUB_PORT = 54321;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDebugTest() {
  console.log('=== Batch Get Responses Debug Test ===\n');
  
  let ws;
  let requestCounter = 0;
  const pendingRequests = new Map();
  
  try {
    // Connect to hub
    console.log('1. Connecting to WebSocket hub...');
    ws = new WebSocket(`ws://localhost:${HUB_PORT}`);
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('✓ Connected to hub\n');
        resolve();
      });
      
      ws.on('error', (error) => {
        console.error('✗ Connection error:', error.message);
        reject(error);
      });
    });
    
    // Set up message handler
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('← Received:', JSON.stringify(message, null, 2));
        
        if (message.requestId && pendingRequests.has(message.requestId)) {
          const { resolve } = pendingRequests.get(message.requestId);
          pendingRequests.delete(message.requestId);
          resolve(message);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });
    
    // Register as MCP client
    console.log('2. Registering as MCP client...');
    ws.send(JSON.stringify({
      type: 'mcp_client_register',
      clientInfo: {
        id: 'debug-test-client',
        name: 'Debug Test Client',
        type: 'test'
      }
    }));
    
    await sleep(500);
    
    // Helper to send request and wait for response
    const sendRequest = (type, params) => {
      return new Promise((resolve, reject) => {
        const requestId = `req-${++requestCounter}`;
        const timeout = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(new Error(`Request ${requestId} timed out`));
        }, 15000);
        
        pendingRequests.set(requestId, { 
          resolve: (response) => {
            clearTimeout(timeout);
            resolve(response);
          }
        });
        
        const message = {
          type,
          requestId,
          params,
          timestamp: Date.now()
        };
        
        console.log('→ Sending:', JSON.stringify(message, null, 2));
        ws.send(JSON.stringify(message));
      });
    };
    
    // Test batch_get_responses with a simple scenario
    console.log('\n3. Testing batch_get_responses...');
    
    // First, get available Claude tabs
    console.log('\n3a. Getting available Claude tabs...');
    const tabsResponse = await sendRequest('get_claude_tabs', {});
    
    if (!tabsResponse.result || tabsResponse.result.length === 0) {
      console.log('No Claude tabs found. Creating one...');
      const spawnResponse = await sendRequest('spawn_claude_tab', {});
      console.log('Created tab:', spawnResponse.result);
      await sleep(2000);
    }
    
    // Get tabs again
    const tabsResponse2 = await sendRequest('get_claude_tabs', {});
    const tabs = tabsResponse2.result || [];
    console.log(`Found ${tabs.length} Claude tabs`);
    
    if (tabs.length === 0) {
      console.error('Failed to create Claude tab');
      return;
    }
    
    // Test batch_get_responses with single tab
    console.log('\n3b. Testing batch_get_responses with tabIds:', [tabs[0].id]);
    
    const batchResponse = await sendRequest('batch_get_responses', {
      tabIds: [tabs[0].id],
      timeoutMs: 5000,
      waitForAll: true,
      pollIntervalMs: 500
    });
    
    console.log('\nBatch response received:');
    console.log(JSON.stringify(batchResponse, null, 2));
    
    // Additional debug: Try direct get_claude_response for comparison
    console.log('\n4. Testing direct get_claude_response for comparison...');
    const directResponse = await sendRequest('get_claude_response', {
      tabId: tabs[0].id,
      waitForCompletion: false,
      timeoutMs: 5000
    });
    
    console.log('\nDirect response received:');
    console.log(JSON.stringify(directResponse, null, 2));
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    if (ws) {
      console.log('\nClosing connection...');
      ws.close();
    }
  }
}

// Run the test
runDebugTest().catch(console.error);