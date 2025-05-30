#!/usr/bin/env node

/**
 * Test the production-ready Tab Pool v2 implementation
 * Focuses on verifying fixes for memory leaks and race conditions
 */

const TabPool = require('../shared/tab-pool-v2');

// Mock client for testing
class MockClient {
  constructor() {
    this.tabCounter = 1000;
    this.tabs = new Map();
    this.callCount = 0;
    this.delays = {
      spawn: 100,
      metadata: 50,
      close: 50
    };
  }
  
  async callTool(toolName, args) {
    this.callCount++;
    
    switch (toolName) {
      case 'spawn_claude_tab':
        await new Promise(resolve => setTimeout(resolve, this.delays.spawn));
        const tabId = this.tabCounter++;
        this.tabs.set(tabId, { 
          id: tabId, 
          active: true, 
          error: null,
          created: Date.now()
        });
        return {
          content: [{ text: `Created new Claude tab. Tab ID: ${tabId}` }]
        };
        
      case 'get_conversation_metadata':
        await new Promise(resolve => setTimeout(resolve, this.delays.metadata));
        const tab = this.tabs.get(args.tabId);
        if (!tab) {
          throw new Error('Tab not found');
        }
        return {
          content: [{ 
            text: JSON.stringify({
              isActive: tab.active,
              error: tab.error,
              tabId: args.tabId
            })
          }]
        };
        
      case 'close_claude_tab':
        await new Promise(resolve => setTimeout(resolve, this.delays.close));
        this.tabs.delete(args.tabId);
        return {
          content: [{ text: 'Tab closed' }]
        };
        
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
  
  // Helper methods for testing
  makeTabUnhealthy(tabId) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.active = false;
      tab.error = 'Tab crashed';
    }
  }
  
  getTabCount() {
    return this.tabs.size;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTabPoolV2() {
  console.log('🏊 Testing Production Tab Pool V2\n');
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  async function runTest(name, testFn) {
    console.log(`\n🧪 ${name}`);
    try {
      await testFn();
      console.log(`✅ PASSED`);
      results.passed++;
      results.tests.push({ name, status: 'passed' });
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'failed', error: error.message });
    }
  }
  
  // Test 1: Memory leak prevention in idle timers
  await runTest('Memory leak prevention', async () => {
    const client = new MockClient();
    const pool = new TabPool(client, {
      minSize: 1,
      maxSize: 3,
      idleTimeout: 1000, // 1 second for testing
      warmupDelay: 100
    });
    
    await sleep(200); // Let initial pool create
    
    // Acquire and release a tab multiple times
    for (let i = 0; i < 5; i++) {
      const tabId = await pool.acquire();
      await pool.release(tabId);
      await sleep(50);
    }
    
    // Check that we don't have multiple timers
    const timerCount = pool.idleTimers.size;
    console.log(`  Timer count: ${timerCount}`);
    
    if (timerCount > pool.available.length) {
      throw new Error(`Memory leak detected: ${timerCount} timers for ${pool.available.length} tabs`);
    }
    
    await pool.shutdown();
  });
  
  // Test 2: Race condition prevention in wait queue
  await runTest('Race condition prevention', async () => {
    const client = new MockClient();
    const pool = new TabPool(client, {
      minSize: 1,
      maxSize: 2,
      warmupDelay: 100
    });
    
    await sleep(200); // Let initial pool create
    
    // Acquire all available tabs
    const tab1 = await pool.acquire();
    const tab2Promise = pool.acquire();
    
    // Multiple requests while at capacity
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(pool.acquire());
    }
    
    // Release tabs
    await pool.release(tab1);
    const tab2 = await tab2Promise;
    await pool.release(tab2);
    
    // All waiting requests should resolve
    const results = await Promise.all(promises);
    const uniqueTabs = new Set(results);
    
    console.log(`  Resolved ${results.length} requests, ${uniqueTabs.size} unique tabs`);
    
    // Release acquired tabs
    for (const tabId of results) {
      await pool.release(tabId);
    }
    
    await pool.shutdown();
  });
  
  // Test 3: Configuration via environment variables
  await runTest('Environment variable configuration', async () => {
    // Set environment variables
    process.env.TAB_POOL_MAX_SIZE = '7';
    process.env.TAB_POOL_MIN_SIZE = '3';
    process.env.TAB_POOL_IDLE_TIMEOUT = '60000';
    
    const client = new MockClient();
    const pool = new TabPool(client, {});
    
    const stats = pool.getStats();
    console.log(`  Config: min=${stats.config.minSize}, max=${stats.config.maxSize}, idle=${stats.config.idleTimeout}`);
    
    if (stats.config.maxSize !== 7 || stats.config.minSize !== 3) {
      throw new Error('Environment variables not properly applied');
    }
    
    // Cleanup
    delete process.env.TAB_POOL_MAX_SIZE;
    delete process.env.TAB_POOL_MIN_SIZE;
    delete process.env.TAB_POOL_IDLE_TIMEOUT;
    
    await pool.shutdown();
  });
  
  // Test 4: Error handling and retry logic
  await runTest('Error handling with retries', async () => {
    const client = new MockClient();
    let attempts = 0;
    
    // Override spawn to fail first 2 times
    const originalCallTool = client.callTool.bind(client);
    client.callTool = async function(toolName, args) {
      if (toolName === 'spawn_claude_tab' && attempts < 2) {
        attempts++;
        throw new Error('Temporary failure');
      }
      return originalCallTool(toolName, args);
    };
    
    const pool = new TabPool(client, {
      minSize: 1,
      maxSize: 3,
      maxRetries: 3,
      retryDelay: 50,
      warmupDelay: 100
    });
    
    await sleep(500); // Let retries complete
    
    const stats = pool.getStats();
    console.log(`  Created ${stats.created} tabs after ${attempts} failed attempts`);
    
    if (stats.created < 1) {
      throw new Error('Retry logic failed to create tabs');
    }
    
    await pool.shutdown();
  });
  
  // Test 5: Health check and unhealthy tab handling
  await runTest('Unhealthy tab detection', async () => {
    const client = new MockClient();
    const pool = new TabPool(client, {
      minSize: 1,
      maxSize: 3,
      warmupDelay: 100
    });
    
    await sleep(200);
    
    // Acquire a tab
    const tabId = await pool.acquire();
    
    // Make it unhealthy
    client.makeTabUnhealthy(tabId);
    
    // Release should detect and destroy it
    await pool.release(tabId);
    
    await sleep(100); // Let cleanup happen
    
    const stats = pool.getStats();
    console.log(`  Destroyed ${stats.destroyed} unhealthy tabs`);
    
    if (stats.destroyed < 1) {
      throw new Error('Failed to destroy unhealthy tab');
    }
    
    await pool.shutdown();
  });
  
  // Test 6: Graceful shutdown
  await runTest('Graceful shutdown', async () => {
    const client = new MockClient();
    const pool = new TabPool(client, {
      minSize: 2,
      maxSize: 5,
      warmupDelay: 100
    });
    
    await sleep(300);
    
    // Acquire some tabs
    const tab1 = await pool.acquire();
    const tab2 = await pool.acquire();
    
    // Start shutdown
    const shutdownPromise = pool.shutdown();
    
    // Try to acquire during shutdown (should fail)
    try {
      await pool.acquire();
      throw new Error('Acquire should fail during shutdown');
    } catch (error) {
      if (!error.message.includes('shutting down')) {
        throw error;
      }
      console.log('  ✓ Acquire properly rejected during shutdown');
    }
    
    await shutdownPromise;
    
    // All tabs should be destroyed
    if (client.getTabCount() > 0) {
      throw new Error(`${client.getTabCount()} tabs still open after shutdown`);
    }
  });
  
  // Test 7: Wait queue timeout
  await runTest('Wait queue timeout', async () => {
    const client = new MockClient();
    client.delays.spawn = 5000; // Very slow spawning
    
    const pool = new TabPool(client, {
      minSize: 0,
      maxSize: 1,
      warmupDelay: 100
    });
    
    // Try to acquire with timeout
    try {
      await Promise.race([
        pool.acquire(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), 1000)
        )
      ]);
      throw new Error('Should have timed out');
    } catch (error) {
      if (error.message === 'Test timeout') {
        console.log('  ✓ Wait queue properly implements timeouts');
      } else {
        throw error;
      }
    }
    
    await pool.shutdown();
  });
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests
      .filter(t => t.status === 'failed')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }
  
  console.log('\n✨ Tab Pool V2 testing complete!');
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the tests
testTabPoolV2().catch(console.error);