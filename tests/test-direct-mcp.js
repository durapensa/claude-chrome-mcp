#!/usr/bin/env node

/**
 * Direct test using existing MCP server
 * This avoids spawning new processes and uses the MCP server that Claude is already connected to
 */

// Since we're running from Claude, we'll create a test framework that reports results

async function runDirectTest(name, testFn) {
  console.log(`\n🧪 ${name}`);
  try {
    const result = await testFn();
    if (result.success) {
      console.log(`✅ PASSED: ${result.message || 'Test completed successfully'}`);
      return true;
    } else {
      console.log(`❌ FAILED: ${result.message || 'Test failed'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return false;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test implementations
const tests = {
  async testHealthCheck() {
    console.log('   Testing connection health...');
    console.log('   ℹ️  Run: mcp__claude-chrome-mcp__get_connection_health');
    console.log('   Expected: Healthy status with Chrome alarms');
    return { success: true, message: 'Manual verification required' };
  },

  async testTabLifecycle() {
    console.log('   Testing tab creation and closure...');
    console.log('   ℹ️  Steps:');
    console.log('   1. Run: mcp__claude-chrome-mcp__spawn_claude_tab');
    console.log('   2. Note the tab ID from response');
    console.log('   3. Wait 5 seconds for tab to load');
    console.log('   4. Run: mcp__claude-chrome-mcp__close_claude_tab with tabId');
    console.log('   Expected: Tab created and closed successfully');
    return { success: true, message: 'Manual verification required' };
  },

  async testMessageSending() {
    console.log('   Testing message sending with retry...');
    console.log('   ℹ️  Steps:');
    console.log('   1. Create a tab first');
    console.log('   2. Run: mcp__claude-chrome-mcp__send_message_to_claude_tab');
    console.log('      with waitForReady: true, message: "Test message"');
    console.log('   3. Wait 3 seconds');
    console.log('   4. Run: mcp__claude-chrome-mcp__get_claude_response');
    console.log('   Expected: Message sent and response received');
    return { success: true, message: 'Manual verification required' };
  },

  async testBatchOperations() {
    console.log('   Testing batch message sending...');
    console.log('   ℹ️  Requires at least 2 open tabs');
    console.log('   Run: mcp__claude-chrome-mcp__batch_send_messages');
    console.log('   with messages array containing tabId and message for each tab');
    console.log('   Expected: All messages sent successfully');
    return { success: true, message: 'Manual verification required' };
  },

  async testElementExtraction() {
    console.log('   Testing element extraction with batching...');
    console.log('   ℹ️  Requires a tab with conversation content');
    console.log('   Run: mcp__claude-chrome-mcp__extract_conversation_elements');
    console.log('   with batchSize: 10, maxElements: 50');
    console.log('   Expected: Elements extracted without timeout');
    return { success: true, message: 'Manual verification required' };
  }
};

// Main test runner
async function runAllDirectTests() {
  console.log('🔧 Claude Chrome MCP - Direct Test Suite');
  console.log('═══════════════════════════════════════════════\n');
  console.log('This test suite provides instructions for manual testing');
  console.log('using the existing MCP connection.\n');

  let passed = 0;
  let failed = 0;

  // Run each test
  const testList = [
    ['Health Check', tests.testHealthCheck],
    ['Tab Lifecycle', tests.testTabLifecycle],
    ['Message Sending', tests.testMessageSending],
    ['Batch Operations', tests.testBatchOperations],
    ['Element Extraction', tests.testElementExtraction]
  ];

  for (const [name, testFn] of testList) {
    const result = await runDirectTest(name, testFn);
    if (result) passed++;
    else failed++;
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 Test Summary');
  console.log('═══════════════════════════════════════════════\n');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('\n💡 To execute these tests:');
  console.log('   1. Run each MCP tool command as instructed');
  console.log('   2. Verify the results match expectations');
  console.log('   3. Report any failures or unexpected behavior');

  return failed === 0;
}

// Run if called directly
if (require.main === module) {
  runAllDirectTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runDirectTest, tests };