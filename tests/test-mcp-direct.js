#!/usr/bin/env node

/**
 * Direct MCP Test - Uses the running MCP server instance
 * 
 * This test connects to the existing MCP server instead of spawning a new one
 */

// Simple direct tests using MCP tools
async function runDirectTests() {
  console.log('🔍 Testing MCP tools directly\n');
  
  const tests = [];
  
  // Test 1: Health Check
  console.log('1. Testing Health Check...');
  try {
    // Since we're running through Claude, we'll just output test instructions
    console.log('   ⚡ Run: mcp__claude-chrome-mcp__get_connection_health');
    console.log('   Expected: Connection status and Chrome alarm info');
    tests.push({ name: 'Health Check', status: 'manual' });
  } catch (error) {
    tests.push({ name: 'Health Check', status: 'error', error: error.message });
  }
  
  // Test 2: List Tabs
  console.log('\n2. Testing Tab List...');
  try {
    console.log('   ⚡ Run: mcp__claude-chrome-mcp__get_claude_tabs');
    console.log('   Expected: Array of open Claude tabs');
    tests.push({ name: 'Tab List', status: 'manual' });
  } catch (error) {
    tests.push({ name: 'Tab List', status: 'error', error: error.message });
  }
  
  // Test 3: List Conversations
  console.log('\n3. Testing Conversation List...');
  try {
    console.log('   ⚡ Run: mcp__claude-chrome-mcp__get_claude_conversations');
    console.log('   Expected: Array of recent conversations');
    tests.push({ name: 'Conversation List', status: 'manual' });
  } catch (error) {
    tests.push({ name: 'Conversation List', status: 'error', error: error.message });
  }
  
  // Test 4: Create Tab
  console.log('\n4. Testing Tab Creation...');
  try {
    console.log('   ⚡ Run: mcp__claude-chrome-mcp__spawn_claude_tab');
    console.log('   Expected: New tab with Tab ID returned');
    tests.push({ name: 'Tab Creation', status: 'manual' });
  } catch (error) {
    tests.push({ name: 'Tab Creation', status: 'error', error: error.message });
  }
  
  console.log('\n📊 Test Summary:');
  console.log('═══════════════');
  tests.forEach(test => {
    const icon = test.status === 'manual' ? '🔧' : '❌';
    console.log(`${icon} ${test.name}: ${test.status}${test.error ? ` - ${test.error}` : ''}`);
  });
  
  console.log('\n💡 Note: This test outputs manual test instructions.');
  console.log('   Run the MCP tools directly to verify functionality.');
}

// Alternative: Test with fetch to WebSocket hub
async function testWebSocketHub() {
  console.log('\n🌐 Testing WebSocket Hub Connection...\n');
  
  try {
    // Test if hub is running on expected port
    const http = require('http');
    
    const testConnection = () => new Promise((resolve) => {
      const req = http.get('http://localhost:54321', (res) => {
        console.log(`Hub HTTP status: ${res.statusCode}`);
        resolve(true);
      });
      
      req.on('error', (error) => {
        console.log(`Hub connection error: ${error.message}`);
        resolve(false);
      });
      
      req.setTimeout(2000, () => {
        req.destroy();
        console.log('Hub connection timeout');
        resolve(false);
      });
    });
    
    const isConnected = await testConnection();
    console.log(`\nHub accessible: ${isConnected ? '✅ Yes' : '❌ No'}`);
    
  } catch (error) {
    console.error('Hub test error:', error.message);
  }
}

// Run tests
async function main() {
  console.log('🧪 Claude Chrome MCP - Direct Test Suite\n');
  
  await runDirectTests();
  await testWebSocketHub();
  
  console.log('\n✅ Test instructions generated');
}

main().catch(console.error);