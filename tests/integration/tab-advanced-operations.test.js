const { MCPTestClient } = require('../helpers/mcp-test-client');
const { PreFlightCheck } = require('../helpers/pre-flight-check');
const { globalTabHygiene, setupTabHygiene, cleanupAllTabs } = require('../helpers/tab-hygiene');

describe('Advanced Tab Operations (Requires Extension)', () => {
  let client;
  let sharedTabId; // Reusable tab for most tests
  
  beforeAll(async () => {
    // Check full integration prerequisites
    const preFlightCheck = new PreFlightCheck();
    
    try {
      const mcpResult = await preFlightCheck.forIntegrationTests();
      console.log(`✅ Integration prerequisites verified (${mcpResult.mcp.toolCount} tools, extension ready)`);
    } catch (error) {
      throw new Error(`Integration prerequisites failed: ${error.message}`);
    }
    
    // Initialize tab hygiene
    const tempClient = new MCPTestClient();
    await tempClient.connect();
    await setupTabHygiene(tempClient);
    
    // Get a shared tab with test content
    sharedTabId = await globalTabHygiene.getSharedTab('advanced-ops');
    
    // Send a test message to have content for extraction/export
    await tempClient.callTool('tab_send_message', {
      tabId: sharedTabId,
      message: "Hello! Can you write a simple Python function to calculate fibonacci numbers?",
      waitForCompletion: true
    });
    
    await tempClient.disconnect();
    console.log(`✅ Prepared shared test tab ${sharedTabId} with conversation content`);
  }, 30000);
  
  afterAll(async () => {
    // Clean up all tabs created by this test suite
    await cleanupAllTabs();
  }, 10000);
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Response Status Operations', () => {
    test('Can get response status during generation', async () => {
      // Create a new tab for this test to control timing
      const testTabId = await globalTabHygiene.createDedicatedTab();
      
      try {
        // Send a message that will take time to respond
        const sendPromise = client.callTool('tab_send_message', {
          tabId: testTabId,
          message: "Please count from 1 to 20 slowly, one number per line.",
          waitForCompletion: false // Don't wait, so we can check status
        });
        
        // Wait a bit for response to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check response status
        const statusResult = await client.callTool('tab_get_response_status', { 
          tabId: testTabId 
        });
        
        expect(statusResult).toBeDefined();
        expect(statusResult).toHaveProperty('isGenerating');
        expect(statusResult).toHaveProperty('hasResponse');
        
        console.log('✅ Response status retrieved:', {
          isGenerating: statusResult.isGenerating,
          hasResponse: statusResult.hasResponse,
          messageCount: statusResult.messageCount
        });
        
        // Wait for completion
        await sendPromise;
      } finally {
        await globalTabHygiene.cleanupTab(testTabId);
      }
    }, 45000);
  });

  describe('Response Forwarding', () => {
    test('Can forward response between tabs', async () => {
      // Create a target tab
      const targetTabId = await globalTabHygiene.createDedicatedTab();
      
      try {
        // Forward the response from shared tab to target tab
        const forwardResult = await client.callTool('tab_forward_response', {
          sourceTabId: sharedTabId,
          targetTabId: targetTabId
        });
        
        expect(forwardResult.success).toBe(true);
        console.log('✅ Response forwarded successfully');
        
        // Verify the message was sent to target tab
        const targetResponse = await client.callTool('tab_get_response', { 
          tabId: targetTabId,
          timeoutMs: 30000
        });
        
        expect(targetResponse.completed).toBe(true);
        expect(targetResponse.content).toBeTruthy();
        console.log('✅ Forwarded response received in target tab');
      } finally {
        await globalTabHygiene.cleanupTab(targetTabId);
      }
    }, 45000);
    
    test('Can forward response with transformation', async () => {
      // Create a target tab
      const targetTabId = await globalTabHygiene.createDedicatedTab();
      
      try {
        // Forward with a transformation template
        const forwardResult = await client.callTool('tab_forward_response', {
          sourceTabId: sharedTabId,
          targetTabId: targetTabId,
          transformTemplate: "Please summarize this response in one sentence: {{response}}"
        });
        
        expect(forwardResult.success).toBe(true);
        console.log('✅ Response forwarded with transformation');
      } finally {
        await globalTabHygiene.cleanupTab(targetTabId);
      }
    }, 45000);
  });

  describe('Content Extraction', () => {
    test('Can extract conversation elements', async () => {
      const extractResult = await client.callTool('tab_extract_elements', {
        tabId: sharedTabId
      });
      
      expect(extractResult).toBeDefined();
      expect(extractResult).toHaveProperty('artifacts');
      expect(extractResult).toHaveProperty('codeBlocks');
      expect(extractResult).toHaveProperty('toolUsage');
      expect(extractResult).toHaveProperty('messageCount');
      
      // Should have at least one code block (fibonacci function)
      if (extractResult.codeBlocks) {
        expect(extractResult.codeBlocks.length).toBeGreaterThan(0);
        console.log(`✅ Extracted ${extractResult.codeBlocks.length} code blocks`);
      }
      
      console.log('✅ Conversation elements extracted:', {
        artifacts: extractResult.artifacts?.length || 0,
        codeBlocks: extractResult.codeBlocks?.length || 0,
        toolUsage: extractResult.toolUsage?.length || 0,
        messages: extractResult.messageCount
      });
    }, 20000);
  });

  describe('Conversation Export', () => {
    test('Can export conversation as markdown', async () => {
      const exportResult = await client.callTool('tab_export_conversation', {
        tabId: sharedTabId,
        format: 'markdown'
      });
      
      expect(exportResult).toBeDefined();
      expect(exportResult.success).toBe(true);
      expect(exportResult.content).toBeTruthy();
      expect(typeof exportResult.content).toBe('string');
      
      // Verify markdown format
      expect(exportResult.content).toMatch(/^# /m); // Has headers
      expect(exportResult.content).toContain('Human:');
      expect(exportResult.content).toContain('Assistant:');
      
      console.log(`✅ Exported conversation as markdown (${exportResult.content.length} chars)`);
    }, 20000);
    
    test('Can export conversation as JSON', async () => {
      const exportResult = await client.callTool('tab_export_conversation', {
        tabId: sharedTabId,
        format: 'json'
      });
      
      expect(exportResult).toBeDefined();
      expect(exportResult.success).toBe(true);
      expect(exportResult.content).toBeTruthy();
      
      // Parse JSON to verify structure
      const parsed = JSON.parse(exportResult.content);
      expect(parsed).toHaveProperty('messages');
      expect(Array.isArray(parsed.messages)).toBe(true);
      expect(parsed.messages.length).toBeGreaterThan(0);
      
      console.log(`✅ Exported conversation as JSON (${parsed.messages.length} messages)`);
    }, 20000);
  });

  describe('Batch Operations', () => {
    test('Can send messages to multiple tabs', async () => {
      // Create two target tabs
      const tab1Id = await globalTabHygiene.createDedicatedTab();
      const tab2Id = await globalTabHygiene.createDedicatedTab();
      
      try {
        // Send messages to both tabs
        const batchResult = await client.callTool('tab_batch_operations', {
          operation: 'send_messages',
          messages: [
            { tabId: tab1Id, message: "What is 2 + 2?" },
            { tabId: tab2Id, message: "What is 3 + 3?" }
          ],
          waitForAll: true,
          sequential: false // Parallel execution
        });
        
        expect(batchResult.success).toBe(true);
        expect(batchResult.results).toBeDefined();
        expect(batchResult.results.length).toBe(2);
        
        // All operations should succeed
        batchResult.results.forEach(result => {
          expect(result.success).toBe(true);
        });
        
        console.log('✅ Batch send completed for 2 tabs');
      } finally {
        // Clean up both tabs
        await globalTabHygiene.cleanupTab(tab1Id);
        await globalTabHygiene.cleanupTab(tab2Id);
      }
    }, 60000);
    
    test('Can get responses from multiple tabs', async () => {
      // Use shared tab and create another tab with content
      const extraTabId = await globalTabHygiene.createDedicatedTab();
      
      // Send a message to the extra tab
      await client.callTool('tab_send_message', {
        tabId: extraTabId,
        message: "What is the capital of France?",
        waitForCompletion: true
      });
      
      try {
        // Get responses from both tabs
        const batchResult = await client.callTool('tab_batch_operations', {
          operation: 'get_responses',
          tabIds: [sharedTabId, extraTabId]
        });
        
        expect(batchResult.success).toBe(true);
        expect(batchResult.results).toBeDefined();
        expect(batchResult.results.length).toBe(2);
        
        // Both tabs should have responses
        batchResult.results.forEach(result => {
          expect(result.success).toBe(true);
          expect(result.data.completed).toBe(true);
          expect(result.data.content).toBeTruthy();
        });
        
        console.log('✅ Batch response retrieval completed for 2 tabs');
      } finally {
        await globalTabHygiene.cleanupTab(extraTabId);
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    test('Handles invalid source tab in forward operation', async () => {
      try {
        await client.callTool('tab_forward_response', {
          sourceTabId: 999999,
          targetTabId: sharedTabId
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toMatch(/tab|not found|invalid/i);
        console.log('✅ Invalid source tab error handled correctly');
      }
    }, 10000);
    
    test('Handles export from non-existent tab', async () => {
      try {
        await client.callTool('tab_export_conversation', {
          tabId: 999999,
          format: 'markdown'
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toMatch(/tab|not found|invalid/i);
        console.log('✅ Export from invalid tab handled correctly');
      }
    }, 10000);
  });
});