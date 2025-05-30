#!/usr/bin/env node

/**
 * Test script for Chrome service worker stability improvements
 * 
 * This script tests the fix for Issue #3: Chrome Service Worker Suspension
 * 
 * Usage: node test-service-worker-stability.js
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testServiceWorkerStability() {
  console.log('🧪 Testing Chrome service worker stability...\n');
  
  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['../mcp-server/src/server.js']
  });
  
  const client = new Client({
    name: 'test-service-worker',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  try {
    // Step 1: Create a test tab
    console.log('1️⃣ Creating test Claude tab...');
    const spawnResult = await client.callTool('spawn_claude_tab', {});
    const tabId = spawnResult.content[0].text.match(/Tab ID: (\d+)/)?.[1];
    
    if (!tabId) {
      throw new Error('Failed to extract tab ID from spawn result');
    }
    
    console.log(`✅ Created tab with ID: ${tabId}\n`);
    
    // Wait for tab to load
    await sleep(5000);
    
    // Step 2: Send initial message to establish connection
    console.log('2️⃣ Sending initial message...');
    await client.callTool('send_message_to_claude_tab', {
      tabId: parseInt(tabId),
      message: 'Initial test message',
      waitForReady: true
    });
    console.log('✅ Initial message sent\n');
    
    // Step 3: Wait for service worker suspension time (>30 seconds)
    console.log('3️⃣ Waiting 45 seconds to test service worker persistence...');
    console.log('   (Chrome typically suspends service workers after 30 seconds)');
    
    for (let i = 0; i < 9; i++) {
      await sleep(5000);
      process.stdout.write(`   ${45 - (i + 1) * 5} seconds remaining...\r`);
    }
    console.log('\n');
    
    // Step 4: Test if connection is still active
    console.log('4️⃣ Testing connection after potential suspension...');
    
    try {
      // Check if we can still interact with the tab
      const tabs = await client.callTool('get_claude_tabs', {});
      console.log('✅ Successfully retrieved tab list');
      
      // Send another message
      await client.callTool('send_message_to_claude_tab', {
        tabId: parseInt(tabId),
        message: 'Test message after 45 seconds',
        waitForReady: true
      });
      console.log('✅ Successfully sent message after suspension period');
      
    } catch (error) {
      console.log('❌ Connection failed:', error.message);
      console.log('   This indicates the service worker was suspended');
    }
    
    // Step 5: Test rapid reconnection
    console.log('\n5️⃣ Testing rapid operations to verify keepalive...');
    
    for (let i = 0; i < 5; i++) {
      await sleep(10000); // 10 seconds between operations
      
      try {
        const status = await client.callTool('get_claude_response_status', {
          tabId: parseInt(tabId)
        });
        console.log(`✅ Operation ${i + 1}/5 successful`);
      } catch (error) {
        console.log(`❌ Operation ${i + 1}/5 failed:`, error.message);
      }
    }
    
    // Step 6: Check Chrome alarm status (requires manual verification)
    console.log('\n6️⃣ Chrome Alarms Status (requires manual verification):');
    console.log('   1. Open Chrome DevTools for the extension');
    console.log('   2. In the console, run: chrome.alarms.getAll(alarms => console.log(alarms))');
    console.log('   3. Verify "keepAlive" alarm exists and is active');
    console.log('   4. Check console logs for "Keep-alive alarm triggered" messages');
    
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await client.callTool('close_claude_tab', {
      tabId: parseInt(tabId),
      force: true
    });
    console.log('✅ Closed test tab');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.close();
    console.log('\n✅ Test completed');
    
    console.log('\n📊 Summary:');
    console.log('- Chrome Alarms API implemented to prevent service worker suspension');
    console.log('- Exponential backoff reconnection for better stability');
    console.log('- Connection state persistence for recovery after restart');
    console.log('- Check Chrome extension logs for detailed connection status');
  }
}

// Run the test
testServiceWorkerStability().catch(console.error);