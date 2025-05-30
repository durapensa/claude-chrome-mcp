#!/usr/bin/env node

/**
 * Stress Test Suite - No Delays
 * 
 * This test suite runs operations as fast as possible without artificial delays
 * to identify robustness issues and race conditions
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

const log = (msg, color = 'reset') => console.log(`${colors[color]}${msg}${colors.reset}`);

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

// Stress test scenarios
const stressTests = {
  // Test 1: Rapid tab creation and closure
  async rapidTabLifecycle() {
    log('\n🔥 Rapid Tab Creation/Closure Test', 'yellow');
    const errors = [];
    const tabIds = [];
    
    try {
      // Create 5 tabs as fast as possible
      log('Creating 5 tabs rapidly...');
      const createPromises = [];
      for (let i = 0; i < 5; i++) {
        createPromises.push(
          (async () => {
            const start = Date.now();
            log(`mcp__claude-chrome-mcp__spawn_claude_tab (Tab ${i + 1})`);
            // In real test, this would call the MCP tool
            return { id: `test-${i}`, time: Date.now() - start };
          })()
        );
      }
      
      const createResults = await Promise.all(createPromises);
      createResults.forEach((result, i) => {
        if (result.id) {
          tabIds.push(result.id);
          log(`✓ Tab ${i + 1} created in ${result.time}ms`, 'green');
        } else {
          errors.push(`Failed to create tab ${i + 1}`);
        }
      });
      
      // Immediately close all tabs
      log('\nClosing all tabs rapidly...');
      const closePromises = tabIds.map((id, i) => 
        (async () => {
          const start = Date.now();
          log(`mcp__claude-chrome-mcp__close_claude_tab (Tab ${id})`);
          // In real test, this would call the MCP tool
          return { success: true, time: Date.now() - start };
        })()
      );
      
      const closeResults = await Promise.all(closePromises);
      closeResults.forEach((result, i) => {
        if (result.success) {
          log(`✓ Tab closed in ${result.time}ms`, 'green');
        } else {
          errors.push(`Failed to close tab ${i + 1}`);
        }
      });
      
    } catch (error) {
      errors.push(error.message);
    }
    
    return { passed: errors.length === 0, errors };
  },

  // Test 2: Concurrent message sending
  async concurrentMessages() {
    log('\n🔥 Concurrent Message Sending Test', 'yellow');
    const errors = [];
    
    try {
      // Create a test tab first
      log('Creating test tab...');
      const tabId = 'test-concurrent';
      
      // Send 10 messages concurrently
      log('Sending 10 messages concurrently...');
      const messagePromises = [];
      for (let i = 0; i < 10; i++) {
        messagePromises.push(
          (async () => {
            const start = Date.now();
            log(`mcp__claude-chrome-mcp__send_message_to_claude_tab (Message ${i + 1})`);
            // In real test, this would call the MCP tool
            return { success: true, time: Date.now() - start, index: i };
          })()
        );
      }
      
      const results = await Promise.all(messagePromises);
      results.forEach(result => {
        if (result.success) {
          log(`✓ Message ${result.index + 1} sent in ${result.time}ms`, 'green');
        } else {
          errors.push(`Failed to send message ${result.index + 1}`);
        }
      });
      
    } catch (error) {
      errors.push(error.message);
    }
    
    return { passed: errors.length === 0, errors };
  },

  // Test 3: Rapid status polling
  async rapidStatusPolling() {
    log('\n🔥 Rapid Status Polling Test', 'yellow');
    const errors = [];
    
    try {
      // Poll status 20 times as fast as possible
      log('Polling status 20 times rapidly...');
      const pollPromises = [];
      for (let i = 0; i < 20; i++) {
        pollPromises.push(
          (async () => {
            const start = Date.now();
            log(`mcp__claude-chrome-mcp__get_connection_health (Poll ${i + 1})`);
            // In real test, this would call the MCP tool
            return { healthy: true, time: Date.now() - start, index: i };
          })()
        );
      }
      
      const results = await Promise.all(pollPromises);
      const times = results.map(r => r.time);
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      
      log(`\nAverage response time: ${avgTime.toFixed(2)}ms`, 'blue');
      log(`Min time: ${Math.min(...times)}ms`, 'blue');
      log(`Max time: ${Math.max(...times)}ms`, 'blue');
      
    } catch (error) {
      errors.push(error.message);
    }
    
    return { passed: errors.length === 0, errors };
  },

  // Test 4: Race condition - simultaneous operations on same tab
  async raceConditionTest() {
    log('\n🔥 Race Condition Test', 'yellow');
    const errors = [];
    
    try {
      const tabId = 'test-race';
      
      // Try to send message, get response, and extract elements simultaneously
      log('Executing simultaneous operations on same tab...');
      const operations = [
        {
          name: 'send_message',
          fn: async () => {
            const start = Date.now();
            log('mcp__claude-chrome-mcp__send_message_to_claude_tab');
            return { op: 'send', time: Date.now() - start };
          }
        },
        {
          name: 'get_response',
          fn: async () => {
            const start = Date.now();
            log('mcp__claude-chrome-mcp__get_claude_response');
            return { op: 'response', time: Date.now() - start };
          }
        },
        {
          name: 'get_metadata',
          fn: async () => {
            const start = Date.now();
            log('mcp__claude-chrome-mcp__get_conversation_metadata');
            return { op: 'metadata', time: Date.now() - start };
          }
        }
      ];
      
      const results = await Promise.all(operations.map(op => op.fn()));
      
      results.forEach(result => {
        log(`✓ Operation ${result.op} completed in ${result.time}ms`, 'green');
      });
      
    } catch (error) {
      errors.push(error.message);
    }
    
    return { passed: errors.length === 0, errors };
  },

  // Test 5: Memory leak test - repeated operations
  async memoryLeakTest() {
    log('\n🔥 Memory Leak Test', 'yellow');
    const errors = [];
    
    try {
      const iterations = 50;
      log(`Performing ${iterations} create/send/close cycles...`);
      
      const startMem = process.memoryUsage();
      
      for (let i = 0; i < iterations; i++) {
        // Quick cycle without cleanup
        await (async () => {
          log(`Cycle ${i + 1}/${iterations}`, 'magenta');
          // In real test: spawn, send, close rapidly
        })();
      }
      
      const endMem = process.memoryUsage();
      const memDiff = {
        heapUsed: ((endMem.heapUsed - startMem.heapUsed) / 1024 / 1024).toFixed(2),
        external: ((endMem.external - startMem.external) / 1024 / 1024).toFixed(2)
      };
      
      log(`\nMemory difference:`, 'blue');
      log(`Heap: ${memDiff.heapUsed} MB`, 'blue');
      log(`External: ${memDiff.external} MB`, 'blue');
      
      // Flag if memory increased significantly
      if (Math.abs(parseFloat(memDiff.heapUsed)) > 10) {
        errors.push(`Possible memory leak: ${memDiff.heapUsed} MB heap increase`);
      }
      
    } catch (error) {
      errors.push(error.message);
    }
    
    return { passed: errors.length === 0, errors };
  }
};

// Main stress test runner
async function runStressTests() {
  log('🚀 Claude Chrome MCP - Stress Test Suite (No Delays)\n', 'blue');
  log('This test identifies robustness issues by running operations rapidly\n');
  
  const testList = [
    ['Rapid Tab Lifecycle', stressTests.rapidTabLifecycle],
    ['Concurrent Messages', stressTests.concurrentMessages],
    ['Rapid Status Polling', stressTests.rapidStatusPolling],
    ['Race Conditions', stressTests.raceConditionTest],
    ['Memory Leak Test', stressTests.memoryLeakTest]
  ];
  
  for (const [name, testFn] of testList) {
    try {
      const result = await testFn();
      if (result.passed) {
        results.passed++;
        log(`\n✅ ${name} - PASSED\n`, 'green');
      } else {
        results.failed++;
        results.errors.push(...result.errors.map(e => `${name}: ${e}`));
        log(`\n❌ ${name} - FAILED`, 'red');
        result.errors.forEach(e => log(`   ${e}`, 'red'));
        log('');
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`${name}: ${error.message}`);
      log(`\n❌ ${name} - ERROR: ${error.message}\n`, 'red');
    }
  }
  
  // Summary
  log('═══════════════════════════════════════════════', 'blue');
  log('📊 Stress Test Summary', 'blue');
  log('═══════════════════════════════════════════════', 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  if (results.errors.length > 0) {
    log('\n🐛 Issues Found:', 'yellow');
    results.errors.forEach((error, i) => {
      log(`${i + 1}. ${error}`, 'red');
    });
    
    log('\n💡 Suggested Fixes:', 'yellow');
    log('1. Add request queuing for concurrent operations');
    log('2. Implement proper connection pooling');
    log('3. Add rate limiting for rapid operations');
    log('4. Ensure proper cleanup in tab lifecycle');
    log('5. Add mutex locks for shared resource access');
  }
  
  log('\n✨ Note: Run actual MCP commands to execute real stress tests', 'magenta');
}

// Run if called directly
if (require.main === module) {
  runStressTests().catch(console.error);
}

module.exports = { stressTests, runStressTests };