#!/usr/bin/env node

/**
 * Pre-flight check for test suite
 * Verifies all prerequisites before running tests
 */

const { MCPTestClient } = require('./mcp-test-client');

async function checkPrerequisites() {
  console.log('🔍 Running pre-flight checks...\n');
  
  const client = new MCPTestClient();
  const errors = [];
  
  try {
    // 1. Check MCP server connection
    console.log('1. Checking MCP server connection...');
    await withTimeout(
      client.connect(),
      5000,
      'MCP server connection timeout - is the daemon running?'
    );
    console.log('   ✅ MCP server connected\n');
    
    // 2. Check system health
    console.log('2. Checking system health...');
    const health = await withTimeout(
      client.callTool('system_health'),
      5000,
      'System health check timeout'
    );
    
    if (!health.relayConnected) {
      errors.push('❌ Relay not connected');
    } else {
      console.log('   ✅ Relay connected');
    }
    
    if (!health.extension) {
      errors.push('❌ Chrome extension not detected');
    } else {
      console.log('   ✅ Extension detected');
      
      const clients = health.extension.connectedClients || [];
      const extensionClients = clients.filter(c => 
        c.type === 'chrome-extension' || c.name.includes('extension')
      );
      
      if (extensionClients.length === 0) {
        errors.push(`❌ No extension clients connected (found: ${clients.map(c => c.name).join(', ')})`);
      } else {
        console.log(`   ✅ Extension clients: ${extensionClients.length}`);
      }
    }
    
    console.log('');
    
    // 3. Quick functional test
    console.log('3. Testing basic functionality...');
    try {
      const tools = await withTimeout(
        client.client.listTools(),
        5000,
        'Tool listing timeout'
      );
      console.log(`   ✅ Found ${tools.length} tools\n`);
    } catch (e) {
      errors.push(`❌ Cannot list tools: ${e.message}`);
    }
    
  } catch (error) {
    errors.push(`❌ ${error.message}`);
  } finally {
    await client.disconnect();
  }
  
  // Report results
  if (errors.length > 0) {
    console.log('\n⚠️  PRE-FLIGHT CHECK FAILED:\n');
    errors.forEach(err => console.log(`   ${err}`));
    console.log('\n📋 TO FIX:');
    console.log('   1. Ensure Chrome browser is running');
    console.log('   2. Check extension at chrome://extensions/');
    console.log('   3. Reload extension: mcp chrome_reload_extension');
    console.log('   4. Verify with: mcp system_health\n');
    process.exit(1);
  }
  
  console.log('✅ All pre-flight checks passed!\n');
  console.log('Ready to run tests.\n');
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(message)), ms)
    )
  ]);
}

// Run if called directly
if (require.main === module) {
  checkPrerequisites().catch(err => {
    console.error('\n❌ Pre-flight check error:', err.message);
    process.exit(1);
  });
}

module.exports = { checkPrerequisites };