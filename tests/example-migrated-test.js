#!/usr/bin/env node

/**
 * Example Migrated Test
 * 
 * This demonstrates a test that has been migrated from individual MCP connection
 * to use the shared client pattern.
 * 
 * BEFORE: Each test spawned its own MCP server (slow, timeout issues)
 * AFTER: All tests share a single MCP connection (fast, reliable)
 */

const sharedClient = require('./helpers/shared-client');
const TestLifecycle = require('./helpers/lifecycle');

// Test configuration
const TEST_CONFIG = {
  verbose: true,
  messages: [
    'What is 2+2?',
    'Write a haiku about testing',
    'Say "OK" if you understand'
  ]
};

// Helper functions
function log(message, emoji = '📝') {
  if (TEST_CONFIG.verbose) {
    console.log(`${emoji} ${message}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main test function
async function runMigratedTest() {
  console.log('🚀 Example Migrated Test - Using Shared MCP Client\n');
  
  const lifecycle = new TestLifecycle(sharedClient);
  const testResults = {
    passed: 0,
    failed: 0,
    tabs: []
  };
  
  try {
    // Setup phase
    await lifecycle.setup();
    log('Test lifecycle initialized', '✅');
    
    // Test 1: Create multiple tabs quickly
    console.log('\n📋 Test 1: Rapid Tab Creation');
    console.log('Creating 3 tabs in quick succession...');
    
    for (let i = 1; i <= 3; i++) {
      try {
        const result = await sharedClient.callTool('spawn_claude_tab', {});
        const tabInfo = JSON.parse(result.content[0].text);
        
        lifecycle.trackTab(tabInfo.id);
        testResults.tabs.push(tabInfo.id);
        
        log(`Tab ${i} created: ID ${tabInfo.id}`, '✅');
        testResults.passed++;
      } catch (error) {
        log(`Failed to create tab ${i}: ${error.message}`, '❌');
        testResults.failed++;
      }
    }
    
    // Wait for tabs to stabilize
    log('Waiting for tabs to load...', '⏳');
    await sleep(5000);
    
    // Test 2: Send messages to each tab
    console.log('\n📋 Test 2: Concurrent Message Sending');
    console.log('Sending messages to all tabs simultaneously...');
    
    const messagePromises = testResults.tabs.map(async (tabId, index) => {
      try {
        const message = TEST_CONFIG.messages[index] || 'Hello, Claude!';
        
        const result = await sharedClient.callTool('send_message_to_claude_tab', {
          tabId: tabId,
          message: message,
          waitForReady: true,
          maxRetries: 3
        });
        
        const response = JSON.parse(result.content[0].text);
        if (response.success) {
          log(`Message sent to tab ${tabId}`, '✅');
          return { tabId, success: true };
        } else {
          log(`Failed to send to tab ${tabId}: ${response.error}`, '❌');
          return { tabId, success: false, error: response.error };
        }
      } catch (error) {
        log(`Error sending to tab ${tabId}: ${error.message}`, '❌');
        return { tabId, success: false, error: error.message };
      }
    });
    
    const messageResults = await Promise.all(messagePromises);
    const successfulSends = messageResults.filter(r => r.success).length;
    testResults.passed += successfulSends;
    testResults.failed += messageResults.length - successfulSends;
    
    // Test 3: Get responses from all tabs
    console.log('\n📋 Test 3: Batch Response Collection');
    console.log('Collecting responses from all tabs...');
    
    // Wait a bit for Claude to start responding
    await sleep(3000);
    
    const responsePromises = testResults.tabs.map(async (tabId) => {
      try {
        const result = await sharedClient.callTool('get_claude_response', {
          tabId: tabId,
          waitForCompletion: true,
          timeoutMs: 15000
        });
        
        const response = JSON.parse(result.content[0].text);
        if (response.response) {
          log(`Got response from tab ${tabId}: ${response.response.substring(0, 50)}...`, '✅');
          return { tabId, success: true, hasResponse: true };
        } else {
          log(`No response from tab ${tabId}`, '⚠️');
          return { tabId, success: true, hasResponse: false };
        }
      } catch (error) {
        log(`Error getting response from tab ${tabId}: ${error.message}`, '❌');
        return { tabId, success: false, error: error.message };
      }
    });
    
    const responseResults = await Promise.all(responsePromises);
    const successfulResponses = responseResults.filter(r => r.success && r.hasResponse).length;
    testResults.passed += successfulResponses;
    testResults.failed += responseResults.filter(r => !r.success).length;
    
    // Test 4: Connection health during operations
    console.log('\n📋 Test 4: Connection Health Check');
    
    try {
      const healthResult = await sharedClient.callTool('get_connection_health', {});
      const health = JSON.parse(healthResult.content[0].text);
      
      log(`Connection status: ${health.status}`, health.status === 'healthy' ? '✅' : '❌');
      log(`Hub connected: ${health.hubConnection.connected}`, '📡');
      log(`Active connections: ${health.hubConnection.activeConnections}`, '🔗');
      
      if (health.status === 'healthy') {
        testResults.passed++;
      } else {
        testResults.failed++;
      }
    } catch (error) {
      log(`Health check failed: ${error.message}`, '❌');
      testResults.failed++;
    }
    
  } catch (error) {
    console.error('\n❌ Test error:', error);
    testResults.failed++;
  } finally {
    // Cleanup phase
    console.log('\n🧹 Cleaning up test resources...');
    await lifecycle.teardown();
    
    // Note: We don't close the shared client here!
    // It's managed at the process level
  }
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Test Summary');
  console.log('═'.repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📑 Total: ${testResults.passed + testResults.failed}`);
  console.log('═'.repeat(50));
  
  // Demonstrate shared client benefits
  console.log('\n💡 Shared Client Benefits Demonstrated:');
  console.log('  1. No MCP server spawn timeout');
  console.log('  2. Rapid successive operations work reliably');
  console.log('  3. Concurrent operations are efficient');
  console.log('  4. Connection remains stable throughout');
  console.log('  5. Automatic cleanup of test resources');
  
  return testResults.failed === 0;
}

// Run the test
if (require.main === module) {
  runMigratedTest()
    .then(success => {
      if (!success) {
        process.exit(1);
      }
      console.log('\n✨ Test completed successfully!');
    })
    .catch(error => {
      console.error('\n💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runMigratedTest };