#!/usr/bin/env node

// Test bridge communication between content script and MCP server
const path = require('path');
const fs = require('fs');

// Import shared client for MCP testing
const clientPath = path.join(__dirname, 'helpers', 'shared-client.js');
const sharedClient = require(clientPath);

async function testBridgeCommunication() {
  console.log('🧪 Testing Bridge Communication...\n');
  
  const client = await sharedClient.connect();
  let testTabId;
  
  try {
    // 1. Create new tab with content script
    console.log('1️⃣ Creating tab with content script injection...');
    const tabResult = await client.request('spawn_claude_dot_ai_tab', {
      injectContentScript: true,
      waitForLoad: true
    });
    
    testTabId = tabResult.id;
    console.log(`✅ Tab created: ${testTabId}`);
    console.log(`📝 Content script injection: ${tabResult.contentScriptInjected}`);
    
    // 2. Test if content script loaded
    console.log('\n2️⃣ Testing content script presence...');
    const scriptCheck = await client.request('execute_script', {
      tabId: testTabId,
      script: 'typeof window.conversationObserver !== "undefined" ? "loaded" : "missing"'
    });
    
    console.log(`📊 Content script status: ${scriptCheck.result.value}`);
    
    // 3. Test manual milestone generation
    console.log('\n3️⃣ Testing manual milestone...');
    await client.request('execute_script', {
      tabId: testTabId,
      script: `
        if (window.conversationObserver) {
          window.conversationObserver.notifyMilestone('test_bridge_manual', 'response_completed', { test: true });
          'milestone sent';
        } else {
          'no observer';
        }
      `
    });
    
    // 4. Check operations state for milestone
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processing
    
    const operationsPath = path.join(__dirname, '..', 'mcp-server', '.operations-state.json');
    const operationsData = JSON.parse(fs.readFileSync(operationsPath, 'utf8'));
    
    console.log('\n4️⃣ Checking operations state...');
    const testOperation = operationsData.operations.find(([id]) => id === 'test_bridge_manual');
    
    if (testOperation) {
      console.log('✅ Manual milestone found in operations state');
      console.log(`📊 Operation data:`, testOperation[1]);
    } else {
      console.log('❌ Manual milestone NOT found in operations state');
      console.log('📊 Available operations:', operationsData.operations.map(([id]) => id).slice(-3));
    }
    
    // 5. Test actual send_message_async
    console.log('\n5️⃣ Testing real async message...');
    const asyncResult = await client.request('send_message_async', {
      tabId: testTabId,
      message: 'Quick test: 5+5'
    });
    
    console.log(`📤 Async operation started: ${asyncResult.operationId}`);
    
    // 6. Wait and check for completion
    console.log('\n6️⃣ Waiting for response completion...');
    try {
      const waitResult = await client.request('wait_for_operation', {
        operationId: asyncResult.operationId,
        timeoutMs: 15000
      });
      
      console.log('✅ Operation completed successfully!');
      console.log(`📊 Milestones: ${waitResult.milestones?.map(m => m.milestone).join(', ')}`);
      
      if (waitResult.milestones?.some(m => m.milestone === 'response_completed')) {
        console.log('🎉 SUCCESS: response_completed milestone detected!');
      } else {
        console.log('⚠️  Missing response_completed milestone');
      }
      
    } catch (error) {
      console.log(`❌ Wait operation failed: ${error.message}`);
      
      // Check final state
      const finalOperationsData = JSON.parse(fs.readFileSync(operationsPath, 'utf8'));
      const finalOperation = finalOperationsData.operations.find(([id]) => id === asyncResult.operationId);
      
      if (finalOperation) {
        console.log(`📊 Final milestones: ${finalOperation[1].milestones?.map(m => m.milestone).join(', ') || 'none'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Cleanup
    if (testTabId) {
      try {
        await client.request('close_claude_dot_ai_tab', { tabId: testTabId });
        console.log(`\n🧹 Cleaned up tab: ${testTabId}`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    await sharedClient.disconnect();
  }
}

if (require.main === module) {
  testBridgeCommunication()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = testBridgeCommunication;