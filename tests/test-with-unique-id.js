#!/usr/bin/env node

/**
 * Test with unique client ID to avoid conflicts
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function testWithUniqueId() {
  console.log('🧪 Testing MCP with unique client ID\n');
  
  // Generate unique client ID
  const uniqueId = `test-client-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  try {
    // Create MCP client with unique ID via environment variables
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['../mcp-server/src/server.js'],
      env: {
        ...process.env,
        CCM_CLIENT_ID: uniqueId,
        CCM_CLIENT_NAME: `Test Client ${uniqueId}`,
        CCM_CLIENT_TYPE: 'test-client'
      }
    });
    
    const client = new Client({
      name: uniqueId,
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    console.log(`📡 Connecting with client ID: ${uniqueId}`);
    await client.connect(transport);
    console.log('✅ Connected successfully!\n');
    
    // Test 1: List tabs
    console.log('1️⃣ Testing tab list...');
    const tabsResult = await client.callTool('get_claude_dot_ai_tabs', {});
    console.log('Tabs:', tabsResult.content[0].text);
    
    // Test 2: Get health
    console.log('\n2️⃣ Testing health check...');
    const healthResult = await client.callTool('get_connection_health', {});
    const health = JSON.parse(healthResult.content[0].text);
    console.log('Health status:', health.status);
    console.log('Hub connected:', health.hubConnection.connected);
    
    // Test 3: Create and close a tab
    console.log('\n3️⃣ Testing tab creation...');
    const spawnResult = await client.callTool('spawn_claude_dot_ai_tab', {});
    const tabInfo = JSON.parse(spawnResult.content[0].text);
    console.log('Created tab:', tabInfo);
    
    // Wait for tab to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Close the tab
    console.log('Closing tab...');
    const closeResult = await client.callTool('close_claude_tab', {
      tabId: tabInfo.id,
      force: true
    });
    console.log('Close result:', closeResult.content[0].text);
    
    // Clean up
    await client.close();
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run test
testWithUniqueId().catch(console.error);