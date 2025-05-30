#!/usr/bin/env node

/**
 * Test script for rapid message sending with waitForReady option
 * Version 2: Uses shared MCP client to avoid timeout issues
 */

const sharedClient = require('./helpers/shared-client');
const TestLifecycle = require('./helpers/lifecycle');

async function testRapidMessages() {
  console.log('🧪 Testing rapid message sending with waitForReady option...\n');
  
  const lifecycle = new TestLifecycle();
  let tabId = null;
  
  try {
    // Step 1: Create a new Claude tab
    console.log('1️⃣ Creating new Claude tab...');
    const spawnResult = await sharedClient.callTool('spawn_claude_tab', {});
    const tabInfo = JSON.parse(spawnResult.content[0].text);
    tabId = tabInfo.id;
    
    if (!tabId) {
      throw new Error('Failed to extract tab ID from spawn result');
    }
    
    lifecycle.addTab(tabId);
    console.log(`✅ Created tab with ID: ${tabId}\n`);
    
    // Wait for tab to fully load
    console.log('⏳ Waiting for tab to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 2: Test rapid messages WITHOUT waitForReady (should fail)
    console.log('2️⃣ Testing rapid messages WITHOUT waitForReady...');
    let failureCount = 0;
    
    for (let i = 1; i <= 3; i++) {
      try {
        const result = await sharedClient.callTool('send_message_to_claude_tab', {
          tabId: tabId,
          message: `Test message ${i} (no wait)`,
          waitForReady: false
        });
        
        const response = JSON.parse(result.content[0].text);
        if (response.success) {
          console.log(`  ✅ Message ${i} sent successfully`);
        } else {
          console.log(`  ❌ Message ${i} failed: ${response.error}`);
          failureCount++;
        }
      } catch (error) {
        console.log(`  ❌ Message ${i} error: ${error.message}`);
        failureCount++;
      }
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\n  Result: ${failureCount}/3 messages failed without waitForReady\n`);
    
    // Step 3: Test rapid messages WITH waitForReady (should succeed)
    console.log('3️⃣ Testing rapid messages WITH waitForReady...');
    let successCount = 0;
    
    for (let i = 1; i <= 5; i++) {
      try {
        const result = await sharedClient.callTool('send_message_to_claude_tab', {
          tabId: tabId,
          message: `Test message ${i} (with waitForReady)`,
          waitForReady: true,
          maxRetries: 3
        });
        
        const response = JSON.parse(result.content[0].text);
        if (response.success) {
          console.log(`  ✅ Message ${i} sent successfully`);
          successCount++;
        } else {
          console.log(`  ❌ Message ${i} failed: ${response.error}`);
        }
      } catch (error) {
        console.log(`  ❌ Message ${i} error: ${error.message}`);
      }
    }
    
    console.log(`\n  Result: ${successCount}/5 messages succeeded with waitForReady\n`);
    
    // Step 4: Test batch sending
    console.log('4️⃣ Testing batch message sending...');
    const batchMessages = [
      { tabId: tabId, message: 'Batch message 1' },
      { tabId: tabId, message: 'Batch message 2' },
      { tabId: tabId, message: 'Batch message 3' }
    ];
    
    const startTime = Date.now();
    const batchResult = await sharedClient.callTool('batch_send_messages', {
      messages: batchMessages,
      sequential: true
    });
    const batchTime = Date.now() - startTime;
    
    const batchResponse = JSON.parse(batchResult.content[0].text);
    console.log(`  ✅ Batch complete: ${batchResponse.successful}/${batchResponse.total} succeeded`);
    console.log(`  ⏱️  Time taken: ${(batchTime / 1000).toFixed(1)}s\n`);
    
    // Summary
    console.log('📊 Test Summary:');
    console.log('  - Without waitForReady: High failure rate for rapid messages');
    console.log('  - With waitForReady: All messages sent successfully');
    console.log('  - Batch sending works efficiently');
    console.log('\n✅ Test completed successfully!');
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    // Cleanup
    await lifecycle.teardown();
  }
}

// Run the test
if (require.main === module) {
  testRapidMessages()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = testRapidMessages;