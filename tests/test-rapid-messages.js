#!/usr/bin/env node

/**
 * Test script for rapid message sending with waitForReady option
 * 
 * This script tests the fix for Issue #2: Rapid Message Sending Failures
 * 
 * Usage: node test-rapid-messages.js
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function testRapidMessages() {
  console.log('🧪 Testing rapid message sending with waitForReady option...\n');
  
  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['./mcp-server/src/server.js']
  });
  
  const client = new Client({
    name: 'test-rapid-messages',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  try {
    // Step 1: Create a new Claude tab
    console.log('1️⃣ Creating new Claude tab...');
    const spawnResult = await client.callTool('spawn_claude_tab', {});
    const tabId = spawnResult.content[0].text.match(/Tab ID: (\d+)/)?.[1];
    
    if (!tabId) {
      throw new Error('Failed to extract tab ID from spawn result');
    }
    
    console.log(`✅ Created tab with ID: ${tabId}\n`);
    
    // Wait for tab to fully load
    console.log('⏳ Waiting for tab to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 2: Test rapid messages WITHOUT waitForReady (should fail)
    console.log('2️⃣ Testing rapid messages WITHOUT waitForReady...');
    
    try {
      await client.callTool('send_message_to_claude_tab', {
        tabId: parseInt(tabId),
        message: 'First message without waitForReady'
      });
      console.log('✅ Sent first message');
      
      // Immediately send second message
      await client.callTool('send_message_to_claude_tab', {
        tabId: parseInt(tabId),
        message: 'Second message without waitForReady'
      });
      console.log('❌ Second message succeeded (unexpected!)');
    } catch (error) {
      console.log('✅ Second message failed as expected:', error.message);
    }
    
    // Wait for Claude to finish responding
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Step 3: Test rapid messages WITH waitForReady (should succeed)
    console.log('\n3️⃣ Testing rapid messages WITH waitForReady...');
    
    try {
      await client.callTool('send_message_to_claude_tab', {
        tabId: parseInt(tabId),
        message: 'First message with waitForReady',
        waitForReady: true
      });
      console.log('✅ Sent first message');
      
      // Immediately send second message with waitForReady
      await client.callTool('send_message_to_claude_tab', {
        tabId: parseInt(tabId),
        message: 'Second message with waitForReady',
        waitForReady: true
      });
      console.log('✅ Second message succeeded with waitForReady!');
    } catch (error) {
      console.log('❌ Second message failed:', error.message);
    }
    
    // Step 4: Test batch sending (uses waitForReady internally)
    console.log('\n4️⃣ Testing batch message sending...');
    
    const batchResult = await client.callTool('batch_send_messages', {
      messages: [
        { tabId: parseInt(tabId), message: 'Batch message 1' },
        { tabId: parseInt(tabId), message: 'Batch message 2' },
        { tabId: parseInt(tabId), message: 'Batch message 3' }
      ],
      sequential: true
    });
    
    console.log('✅ Batch messages sent successfully');
    
    // Step 5: Get conversation metadata to verify all messages
    console.log('\n5️⃣ Verifying messages in conversation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const metadata = await client.callTool('get_conversation_metadata', {
      tabId: parseInt(tabId),
      includeMessages: true
    });
    
    const messageCount = JSON.parse(metadata.content[0].text).totalMessages;
    console.log(`✅ Total messages in conversation: ${messageCount}`);
    
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await client.callTool('close_claude_tab', {
      tabId: parseInt(tabId),
      force: true
    });
    console.log('✅ Closed test tab');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.close();
    console.log('\n✅ Test completed');
  }
}

// Run the test
testRapidMessages().catch(console.error);