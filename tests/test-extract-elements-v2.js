#!/usr/bin/env node

/**
 * Test extract_conversation_elements improvements with batching
 * Version 2: Uses shared MCP client
 */

const sharedClient = require('./helpers/shared-client');
const TestLifecycle = require('./helpers/lifecycle');

async function testExtractElements() {
  console.log('🧪 Testing extract_conversation_elements improvements...\n');
  
  const lifecycle = new TestLifecycle();
  let tabId = null;
  
  try {
    // Step 1: Create test tab
    console.log('1️⃣ Creating test Claude tab...');
    const spawnResult = await sharedClient.callTool('spawn_claude_tab', {});
    const tabInfo = JSON.parse(spawnResult.content[0].text);
    tabId = tabInfo.id;
    lifecycle.addTab(tabId);
    console.log(`✅ Created tab: ${tabId}\n`);
    
    // Wait for tab to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 2: Send messages with various elements
    console.log('2️⃣ Sending messages with code blocks and artifacts...');
    
    const messages = [
      'Can you show me a Python function to calculate fibonacci numbers?',
      'Now show me the same in JavaScript with proper error handling',
      'Create a React component that displays a counter'
    ];
    
    for (let i = 0; i < messages.length; i++) {
      console.log(`   Sending message ${i + 1}/${messages.length}...`);
      await sharedClient.callTool('send_message_to_claude_tab', {
        tabId: tabId,
        message: messages[i],
        waitForReady: true
      });
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get response to ensure it completed
      await sharedClient.callTool('get_claude_response', {
        tabId: tabId,
        waitForCompletion: true,
        timeoutMs: 15000
      });
      
      console.log(`   ✅ Response ${i + 1} received`);
    }
    
    console.log('\n3️⃣ Testing element extraction with default parameters...');
    const extractDefault = await sharedClient.callTool('extract_conversation_elements', {
      tabId: tabId
    });
    
    const defaultData = JSON.parse(extractDefault.content[0].text);
    console.log('Default extraction results:');
    console.log(`  - Success: ${defaultData.success}`);
    console.log(`  - Code blocks: ${defaultData.data.codeBlocks.length}`);
    console.log(`  - Artifacts: ${defaultData.data.artifacts.length}`);
    console.log(`  - Tool uses: ${defaultData.data.toolUses.length}`);
    console.log(`  - Truncated: ${defaultData.truncated || false}`);
    
    // Step 4: Test with custom batch parameters
    console.log('\n4️⃣ Testing extraction with custom batch parameters...');
    const extractCustom = await sharedClient.callTool('extract_conversation_elements', {
      tabId: tabId,
      batchSize: 2,
      maxElements: 3
    });
    
    const customData = JSON.parse(extractCustom.content[0].text);
    console.log('Custom extraction results (batchSize: 2, maxElements: 3):');
    console.log(`  - Success: ${customData.success}`);
    console.log(`  - Code blocks: ${customData.data.codeBlocks.length}`);
    console.log(`  - Artifacts: ${customData.data.artifacts.length}`);
    console.log(`  - Tool uses: ${customData.data.toolUses.length}`);
    console.log(`  - Truncated: ${customData.truncated}`);
    console.log(`  - Max elements reached: ${customData.maxElementsReached || 'N/A'}`);
    
    // Step 5: Verify extracted content
    console.log('\n5️⃣ Verifying extracted content...');
    if (defaultData.data.codeBlocks.length > 0) {
      const firstBlock = defaultData.data.codeBlocks[0];
      console.log('First code block:');
      console.log(`  - Language: ${firstBlock.language || 'plain'}`);
      console.log(`  - Length: ${firstBlock.content.length} characters`);
      console.log(`  - Preview: ${firstBlock.content.substring(0, 50)}...`);
    }
    
    // Summary
    console.log('\n📊 Summary:');
    console.log('  - Added batchSize and maxElements parameters to prevent timeouts');
    console.log('  - Extraction now processes elements in batches');
    console.log('  - Early termination when maxElements is reached');
    console.log('  - Improved performance for large conversations');
    
    console.log('\n✅ Test completed');
    
    return {
      success: defaultData.success && customData.success,
      elementsCaptured: defaultData.data.codeBlocks.length > 0
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    await lifecycle.teardown();
  }
}

// Run the test
if (require.main === module) {
  testExtractElements()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = testExtractElements;