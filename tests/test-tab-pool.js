#!/usr/bin/env node

/**
 * Test the Tab Pool implementation
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const TabPool = require('../shared/tab-pool');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTabPool() {
  console.log('🏊 Testing Tab Pool\n');
  
  let client;
  let pool;
  
  try {
    // Create MCP client
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['../mcp-server/src/server.js']
    });
    
    client = new Client({
      name: 'tab-pool-test',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');
    
    // Create tab pool
    pool = new TabPool(client, {
      maxSize: 3,
      minSize: 1,
      idleTimeout: 30000, // 30 seconds for testing
      warmupDelay: 3000,  // 3 seconds
      logLevel: 'debug'
    });
    
    // Wait for initial pool creation
    await sleep(5000);
    
    console.log('\n📊 Initial pool stats:', pool.getStats());
    
    // Test 1: Acquire and release tabs
    console.log('\n🧪 Test 1: Acquire and release');
    const tab1 = await pool.acquire();
    console.log('Acquired tab:', tab1);
    
    const tab2 = await pool.acquire();
    console.log('Acquired tab:', tab2);
    
    console.log('Pool stats:', pool.getStats());
    
    // Send messages to test tabs
    await client.callTool('send_message_to_claude_tab', {
      tabId: tab1,
      message: 'Hello from tab pool test 1',
      waitForReady: true
    });
    
    await client.callTool('send_message_to_claude_tab', {
      tabId: tab2,
      message: 'Hello from tab pool test 2',
      waitForReady: true
    });
    
    // Release tabs back to pool
    await pool.release(tab1);
    await pool.release(tab2);
    
    console.log('Pool stats after release:', pool.getStats());
    
    // Test 2: Reuse tabs
    console.log('\n🧪 Test 2: Tab reuse');
    const tab3 = await pool.acquire();
    console.log('Acquired tab (should be reused):', tab3);
    console.log('Is reused?', tab3 === tab1 || tab3 === tab2);
    
    await pool.release(tab3);
    
    // Test 3: Pool capacity
    console.log('\n🧪 Test 3: Pool capacity');
    const tabs = [];
    
    // Acquire all tabs
    for (let i = 0; i < 3; i++) {
      const tab = await pool.acquire();
      tabs.push(tab);
      console.log(`Acquired tab ${i + 1}:`, tab);
    }
    
    console.log('Pool at capacity:', pool.getStats());
    
    // Try to acquire one more (should wait)
    console.log('Attempting to acquire beyond capacity...');
    const acquirePromise = pool.acquire();
    
    // Release one after 2 seconds
    setTimeout(async () => {
      console.log('Releasing a tab...');
      await pool.release(tabs[0]);
    }, 2000);
    
    const extraTab = await acquirePromise;
    console.log('Got extra tab after wait:', extraTab);
    
    // Release all
    await pool.release(extraTab);
    for (let i = 1; i < tabs.length; i++) {
      await pool.release(tabs[i]);
    }
    
    // Test 4: Idle timeout (abbreviated for demo)
    console.log('\n🧪 Test 4: Idle timeout simulation');
    console.log('Pool stats before idle:', pool.getStats());
    console.log('(In production, idle tabs would be destroyed after 5 minutes)');
    
    // Final stats
    console.log('\n📊 Final pool stats:', pool.getStats());
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Cleanup
    if (pool) {
      console.log('\n🧹 Shutting down pool...');
      await pool.shutdown();
    }
    
    if (client) {
      await client.close();
    }
    
    console.log('\n✅ Test complete');
  }
}

// Run the test
testTabPool().catch(console.error);