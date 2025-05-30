#!/usr/bin/env node

/**
 * Example test using the new lifecycle management
 * 
 * Demonstrates proper setup, teardown, and resource tracking
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const TestLifecycle = require('./helpers/lifecycle');
const SmartTestRunner = require('./helpers/smart-runner');

// Example test suite using lifecycle management
const tests = [
  {
    name: 'Tab Creation and Cleanup',
    fn: async (client, lifecycle) => {
      // Create a tab - it will be automatically cleaned up
      const spawnResult = await client.callTool('spawn_claude_tab', {});
      const tabIdMatch = spawnResult.content[0].text.match(/Tab ID: (\d+)/);
      const tabId = tabIdMatch ? parseInt(tabIdMatch[1]) : null;
      
      if (!tabId) {
        return { success: false, message: 'Failed to create tab' };
      }
      
      // Track the tab for automatic cleanup
      lifecycle.trackTab(tabId);
      
      // Wait for load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify tab exists
      const tabsResult = await client.callTool('get_claude_tabs', {});
      const tabs = JSON.parse(tabsResult.content[0].text);
      const tabExists = tabs.some(t => t.id === tabId);
      
      return {
        success: tabExists,
        message: tabExists ? `Tab ${tabId} created successfully` : 'Tab not found'
      };
      // Tab will be automatically closed during teardown
    }
  },
  
  {
    name: 'Message Send with Response',
    fn: async (client, lifecycle) => {
      // Create a test tab
      const spawnResult = await client.callTool('spawn_claude_tab', {});
      const tabIdMatch = spawnResult.content[0].text.match(/Tab ID: (\d+)/);
      const tabId = tabIdMatch ? parseInt(tabIdMatch[1]) : null;
      
      if (!tabId) {
        return { success: false, message: 'Failed to create tab' };
      }
      
      lifecycle.trackTab(tabId);
      
      // Wait for tab to be ready
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Send a message
      const sendResult = await client.callTool('send_message_to_claude_tab', {
        tabId: tabId,
        message: 'Please respond with just the word "OK"',
        waitForReady: true
      });
      
      const sendSuccess = sendResult.content[0].text.includes('"success": true');
      
      if (!sendSuccess) {
        return { success: false, message: 'Failed to send message' };
      }
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get response
      const responseResult = await client.callTool('get_claude_response', {
        tabId: tabId,
        waitForCompletion: true,
        timeoutMs: 10000
      });
      
      const responseText = responseResult.content[0].text;
      const hasOK = responseText.includes('OK');
      
      // Track conversation for reference (though we won't delete it)
      const conversationMatch = responseText.match(/"conversationId":\s*"([^"]+)"/);
      if (conversationMatch) {
        lifecycle.trackConversation(conversationMatch[1]);
      }
      
      return {
        success: hasOK,
        message: hasOK ? 'Got expected response' : 'Response did not contain OK'
      };
    }
  },
  
  {
    name: 'Custom Cleanup Task',
    fn: async (client, lifecycle) => {
      // Example of adding a custom cleanup task
      let tempResource = { id: 'temp-' + Date.now(), cleaned: false };
      
      // Add custom cleanup
      lifecycle.addCleanup(async () => {
        tempResource.cleaned = true;
        console.log(`   Cleaned up temporary resource: ${tempResource.id}`);
      });
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        success: true,
        message: 'Custom cleanup registered'
      };
    }
  },
  
  {
    name: 'Deliberate Failure Test',
    fn: async (client, lifecycle) => {
      // This test deliberately fails to demonstrate failure recording
      return {
        success: false,
        message: 'This test failed on purpose to demonstrate failure recording',
        error: new Error('Deliberate test failure')
      };
    }
  }
];

// Main function
async function runExample() {
  console.log('🧪 Lifecycle Management Example\n');
  
  let client;
  
  try {
    // Create MCP client
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['../mcp-server/src/server.js']
    });
    
    client = new Client({
      name: 'lifecycle-example',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');
    
    // Create test runner
    const runner = new SmartTestRunner({
      verbose: true,
      stopOnFailure: false,
      resultsDir: './results'
    });
    
    // Run tests with lifecycle management
    const results = await runner.run(tests, client);
    
    // Summary
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log('\n📊 Summary:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('\n💡 Run ./view-results.js to see detailed results');
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run the example
runExample().catch(console.error);