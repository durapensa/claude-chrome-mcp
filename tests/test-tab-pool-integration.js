#!/usr/bin/env node

/**
 * Test Tab Pool Integration with MCP Server
 */

const TabPoolWrapper = require('../mcp-server/src/tab-pool-wrapper');

// Mock hub client for testing
class MockHubClient {
  constructor() {
    this.tabCounter = 2000;
    this.requestCount = 0;
  }
  
  async sendRequest(method, args) {
    this.requestCount++;
    
    if (method === 'spawn_claude_tab') {
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const tabId = this.tabCounter++;
      return {
        success: true,
        id: tabId,
        message: `Created new Claude tab. Tab ID: ${tabId}`
      };
    }
    
    throw new Error(`Unknown method: ${method}`);
  }
  
  async callTool(toolName, args) {
    // Delegate to sendRequest for compatibility with TabPool
    if (toolName === 'spawn_claude_tab') {
      const result = await this.sendRequest(toolName, args);
      return {
        content: [{ text: result.message }]
      };
    }
    
    if (toolName === 'get_conversation_metadata') {
      return {
        content: [{ 
          text: JSON.stringify({
            isActive: true,
            error: null,
            tabId: args.tabId
          })
        }]
      };
    }
    
    if (toolName === 'close_claude_tab') {
      return {
        content: [{ text: 'Tab closed' }]
      };
    }
    
    throw new Error(`Unknown tool: ${toolName}`);
  }
}

async function testTabPoolIntegration() {
  console.log('🧪 Testing Tab Pool Integration\n');
  
  const results = {
    passed: 0,
    failed: 0
  };
  
  async function runTest(name, testFn) {
    console.log(`\n▶️  ${name}`);
    try {
      await testFn();
      console.log(`✅ PASSED`);
      results.passed++;
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      console.error(error);
      results.failed++;
    }
  }
  
  // Test 1: Basic wrapper functionality
  await runTest('Tab pool wrapper creation', async () => {
    process.env.TAB_POOL_ENABLED = '1';
    
    const hubClient = new MockHubClient();
    const wrapper = new TabPoolWrapper(hubClient, {
      minSize: 1,
      maxSize: 3,
      warmupDelay: 100
    });
    
    // Wait for initial pool to fully initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const stats = wrapper.getStats();
    console.log(`  Pool stats:`, stats);
    
    if (!stats.enabled || (stats.available + stats.busy + stats.warming) < 1) {
      throw new Error('Pool not properly initialized');
    }
    
    await wrapper.shutdown();
  });
  
  // Test 2: Spawn with pool
  await runTest('Spawn using pool', async () => {
    const hubClient = new MockHubClient();
    const wrapper = new TabPoolWrapper(hubClient, {
      minSize: 2,
      maxSize: 4,
      warmupDelay: 100
    });
    
    // Wait for pool to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Record initial request count
    const initialRequests = hubClient.requestCount;
    
    // Spawn a tab (should use pool)
    const result = await wrapper.handleSpawnRequest();
    console.log(`  Spawn result:`, result);
    
    if (result.source !== 'pool') {
      throw new Error('Expected tab from pool');
    }
    
    // Check hub client wasn't called for this spawn
    if (hubClient.requestCount > initialRequests) {
      throw new Error(`Hub client called for spawn when pool should be used (before: ${initialRequests}, after: ${hubClient.requestCount})`);
    }
    
    await wrapper.shutdown();
  });
  
  // Test 3: Pool disabled
  await runTest('Pool disabled behavior', async () => {
    process.env.TAB_POOL_ENABLED = '0';
    
    const hubClient = new MockHubClient();
    const wrapper = new TabPoolWrapper(hubClient);
    
    // Try to spawn (should go direct)
    const result = await wrapper.handleSpawnRequest();
    console.log(`  Spawn result:`, result);
    
    if (result.source === 'pool') {
      throw new Error('Pool should be disabled');
    }
    
    // Try to get stats
    const stats = wrapper.getStats();
    if (stats.enabled) {
      throw new Error('Pool should report as disabled');
    }
    
    // Cleanup
    delete process.env.TAB_POOL_ENABLED;
  });
  
  // Test 4: Release and reuse
  await runTest('Tab release and reuse', async () => {
    process.env.TAB_POOL_ENABLED = '1';
    
    const hubClient = new MockHubClient();
    const wrapper = new TabPoolWrapper(hubClient, {
      minSize: 1,
      maxSize: 3,
      warmupDelay: 100
    });
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Spawn a tab
    const result1 = await wrapper.handleSpawnRequest();
    const tabId = result1.id;
    
    // Release it
    await wrapper.releaseTab(tabId);
    
    // Spawn again (should get same tab)
    const result2 = await wrapper.handleSpawnRequest();
    
    console.log(`  First tab: ${tabId}, Second tab: ${result2.id}`);
    if (result2.id !== tabId) {
      throw new Error('Should have reused the same tab');
    }
    
    await wrapper.shutdown();
    delete process.env.TAB_POOL_ENABLED;
  });
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (results.failed === 0) {
    console.log('\n✨ Tab pool integration working correctly!');
  }
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
testTabPoolIntegration().catch(console.error);