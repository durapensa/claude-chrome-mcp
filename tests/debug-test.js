#!/usr/bin/env node

const { MCPTestClient } = require('./helpers/mcp-test-client');

async function debugTest() {
  console.log('=== Debug Test Starting ===\n');
  
  // First check daemon's health
  console.log('0. Checking daemon health via CLI...');
  const { execSync } = require('child_process');
  try {
    const daemonHealth = execSync('mcp system_health', { encoding: 'utf8' });
    console.log('   Daemon health:', daemonHealth.trim());
  } catch (e) {
    console.log('   ❌ Daemon health check failed');
  }
  
  const client = new MCPTestClient();
  
  try {
    // Connect
    console.log('\n1. Connecting test MCP server...');
    await client.connect();
    console.log('   ✅ Connected\n');
    
    // Check what tools are available
    console.log('2. Listing available tools...');
    try {
      const tools = await client.client.listTools();
      console.log(`   ✅ Found ${tools?.tools?.length || 0} tools`);
      if (tools?.tools?.length > 0) {
        console.log(`   First few tools: ${tools.tools.slice(0, 3).map(t => t.name).join(', ')}`);
      }
    } catch (e) {
      console.log('   ❌ Failed to list tools:', e.message);
    }
    
    // Try system health
    console.log('\n3. Calling system_health tool...');
    const startTime = Date.now();
    const health = await Promise.race([
      client.callTool('system_health'),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT after 5s')), 5000)
      )
    ]);
    const elapsed = Date.now() - startTime;
    console.log(`   ✅ Got response in ${elapsed}ms\n`);
    console.log('   Health:', JSON.stringify(health, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    console.log('\n4. Disconnecting...');
    await client.disconnect();
  }
  
  console.log('\n=== Debug Test Complete ===');
}

debugTest().catch(console.error);