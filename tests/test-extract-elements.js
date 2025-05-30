#!/usr/bin/env node

/**
 * Test script for extract_conversation_elements improvements
 * 
 * This script tests the fix for Issue #4: extract_conversation_elements MCP Timeout
 * 
 * Usage: node test-extract-elements.js
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testExtractElements() {
  console.log('🧪 Testing extract_conversation_elements improvements...\n');
  
  // Create MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['../mcp-server/src/server.js']
  });
  
  const client = new Client({
    name: 'test-extract-elements',
    version: '1.0.0'
  }, {
    capabilities: {}
  });
  
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');
  
  try {
    // Step 1: Create a test tab with rich content
    console.log('1️⃣ Creating test Claude tab...');
    const spawnResult = await client.callTool('spawn_claude_tab', {});
    const tabId = spawnResult.content[0].text.match(/Tab ID: (\d+)/)?.[1];
    
    if (!tabId) {
      throw new Error('Failed to extract tab ID from spawn result');
    }
    
    console.log(`✅ Created tab with ID: ${tabId}\n`);
    
    // Wait for tab to load
    await sleep(5000);
    
    // Step 2: Send messages that will create artifacts and code blocks
    console.log('2️⃣ Creating conversation with rich content...');
    
    await client.callTool('send_message_to_claude_tab', {
      tabId: parseInt(tabId),
      message: 'Create a simple HTML file with CSS and JavaScript that shows a counter',
      waitForReady: true
    });
    
    console.log('⏳ Waiting for response with artifacts...');
    await sleep(15000);
    
    await client.callTool('send_message_to_claude_tab', {
      tabId: parseInt(tabId),
      message: 'Now add 5 more features to the counter with code examples',
      waitForReady: true
    });
    
    console.log('⏳ Waiting for more content...');
    await sleep(15000);
    
    // Step 3: Test extraction with default parameters
    console.log('\n3️⃣ Testing extraction with default parameters...');
    const startTime = Date.now();
    
    try {
      const defaultResult = await client.callTool('extract_conversation_elements', {
        tabId: parseInt(tabId)
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`✅ Default extraction completed in ${elapsed}ms`);
      
      const data = JSON.parse(defaultResult.content[0].text);
      console.log(`   Found: ${data.artifacts.length} artifacts, ${data.codeBlocks.length} code blocks, ${data.toolUsage.length} tool usage`);
      console.log(`   Total elements: ${data.totalElements}`);
      if (data.truncated) {
        console.log(`   ⚠️  Extraction was truncated at ${data.maxElementsReached} elements`);
      }
    } catch (error) {
      console.log(`❌ Default extraction failed: ${error.message}`);
    }
    
    // Step 4: Test with small batch size
    console.log('\n4️⃣ Testing extraction with small batch size...');
    const startTime2 = Date.now();
    
    try {
      const batchResult = await client.callTool('extract_conversation_elements', {
        tabId: parseInt(tabId),
        batchSize: 10,
        maxElements: 50
      });
      
      const elapsed = Date.now() - startTime2;
      console.log(`✅ Batch extraction completed in ${elapsed}ms`);
      
      const data = JSON.parse(batchResult.content[0].text);
      console.log(`   Found: ${data.artifacts.length} artifacts, ${data.codeBlocks.length} code blocks`);
      console.log(`   Total elements: ${data.totalElements}`);
      if (data.truncated) {
        console.log(`   ⚠️  Extraction was truncated at ${data.maxElementsReached} elements`);
      }
    } catch (error) {
      console.log(`❌ Batch extraction failed: ${error.message}`);
    }
    
    // Step 5: Test execute_script workaround for comparison
    console.log('\n5️⃣ Testing execute_script workaround...');
    const startTime3 = Date.now();
    
    try {
      const scriptResult = await client.callTool('execute_script', {
        tabId: parseInt(tabId),
        script: `
          const elements = document.querySelectorAll('pre > code').length;
          const artifacts = document.querySelectorAll('[data-testid*="artifact"]').length;
          ({ codeBlocks: elements, artifacts: artifacts })
        `
      });
      
      const elapsed = Date.now() - startTime3;
      console.log(`✅ Execute script completed in ${elapsed}ms`);
      console.log(`   Result: ${scriptResult.content[0].text}`);
    } catch (error) {
      console.log(`❌ Execute script failed: ${error.message}`);
    }
    
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
    
    console.log('\n📊 Summary:');
    console.log('- Added batchSize and maxElements parameters to prevent timeouts');
    console.log('- Extraction now processes elements in batches');
    console.log('- Early termination when maxElements is reached');
    console.log('- Improved performance for large conversations');
  }
}

// Run the test
testExtractElements().catch(console.error);