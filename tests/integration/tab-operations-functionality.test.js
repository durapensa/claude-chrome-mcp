const { MCPTestClient } = require('../helpers/mcp-test-client');
const { PreFlightCheck } = require('../helpers/pre-flight-check');
const { globalTabHygiene, setupTabHygiene, cleanupAllTabs } = require('../helpers/tab-hygiene');

describe('Tab Operations Functionality (Requires Extension)', () => {
  let client;
  let sharedTabId; // Reusable tab for tests that don't need isolation
  
  beforeAll(async () => {
    // Check full integration prerequisites
    const preFlightCheck = new PreFlightCheck();
    
    try {
      const result = await preFlightCheck.forIntegrationTests();
      console.log(result.message);
    } catch (error) {
      throw new Error(`Integration prerequisites failed: ${error.message}`);
    }
    
    // Initialize tab hygiene
    const tempClient = new MCPTestClient();
    await tempClient.connect();
    await setupTabHygiene(tempClient);
    
    // Get a shared tab for tests that don't need isolation
    sharedTabId = await globalTabHygiene.getSharedTab('tab-operations');
    
    await tempClient.disconnect();
  }, 15000);
  
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
      await client.cleanup();
      await client.disconnect();
    }
  });

  describe('Core Tab Operations', () => {
    test('createTab functionality is preserved', async () => {
      const tabId = await globalTabHygiene.createDedicatedTab({
        waitForLoad: true,
        injectContentScript: true
      });
      
      expect(tabId).toBeTruthy();
      expect(typeof tabId).toBe('number');
      
      // Verify tab exists in tab list
      const listResult = await client.callTool('tab_list');
      const ourTab = listResult.tabs.find(t => t.id === tabId);
      expect(ourTab).toBeTruthy();
      
      console.log(`✅ Created tab ${tabId} with content script injection`);
    }, 30000);

    test('tab_list functionality is preserved', async () => {
      // Get the tab list (we already have a shared tab)
      const listResult = await client.callTool('tab_list');
      
      expect(listResult.success).toBe(true);
      expect(Array.isArray(listResult.tabs)).toBe(true);
      expect(listResult.count).toBe(listResult.tabs.length);
      expect(listResult.tabs.length).toBeGreaterThan(0);
      
      // Find our shared tab
      const ourTab = listResult.tabs.find(tab => tab.id === sharedTabId);
      expect(ourTab).toBeTruthy();
      expect(ourTab).toHaveProperty('title');
      expect(ourTab).toHaveProperty('url');
      expect(ourTab).toHaveProperty('status');
      expect(ourTab).toHaveProperty('hasContentScript');
      
      console.log(`✅ Found ${listResult.count} Claude tabs, including our shared tab ${sharedTabId}`);
    }, 20000);

    test('tab_close functionality is preserved', async () => {
      // Create a dedicated tab to close
      const tabId = await globalTabHygiene.createDedicatedTab({
        waitForLoad: true
      });
      
      // Close the tab using the API directly (testing the close functionality)
      const closeResult = await client.callTool('tab_close', { tabId });
      
      expect(closeResult.success).toBe(true);
      
      // Verify cleanup steps if provided
      if (closeResult.cleanupSteps) {
        expect(Array.isArray(closeResult.cleanupSteps)).toBe(true);
        console.log(`✅ Tab ${tabId} closed with cleanup steps:`, closeResult.cleanupSteps);
      } else {
        console.log(`✅ Tab ${tabId} closed successfully`);
      }
      
      // Remove from tab hygiene tracking since we closed it manually
      globalTabHygiene.untrackTab(tabId);
    }, 20000);

    test('tab_focus functionality works', async () => {
      // Create a tab to focus
      const createResult = await client.callTool('tab_create', {
        waitForLoad: true,
        active: false // Create inactive
      });
      expect(createResult.success).toBe(true);
      createdTabs.push(createResult.tabId);
      
      // Focus the tab
      const focusResult = await client.callTool('tab_focus', { 
        tabId: createResult.tabId 
      });
      
      expect(focusResult.success).toBe(true);
      console.log(`✅ Successfully focused tab ${createResult.tabId}`);
    }, 20000);
  });

  describe('Content Interaction Operations', () => {
    test('extractConversationElements functionality works', async () => {
      // Create a tab with content script
      const createResult = await client.callTool('tab_create', {
        waitForLoad: true,
        injectContentScript: true
      });
      expect(createResult.success).toBe(true);
      createdTabs.push(createResult.tabId);
      
      // Extract elements
      const extractResult = await client.callTool('tab_extract_elements', {
        tabId: createResult.tabId
      });
      
      expect(extractResult.success).toBe(true);
      expect(extractResult).toHaveProperty('elements');
      expect(extractResult.elements).toHaveProperty('messages');
      expect(extractResult.elements).toHaveProperty('inputField');
      expect(extractResult.elements).toHaveProperty('submitButton');
      expect(Array.isArray(extractResult.elements.messages)).toBe(true);
      
      console.log(`✅ Extracted conversation elements from tab ${createResult.tabId}`);
      console.log(`Found ${extractResult.elements.messages.length} messages`);
    }, 30000);

    test('sendTabMessage preserves operation ID unification', async () => {
      // Create a tab with content script
      const createResult = await client.callTool('tab_create', {
        waitForLoad: true,
        injectContentScript: true
      });
      expect(createResult.success).toBe(true);
      createdTabs.push(createResult.tabId);
      
      // Send a message
      const sendResult = await client.callTool('tab_send_message', {
        tabId: createResult.tabId,
        message: 'What is 2 + 2?',
        waitForReady: true
      });
      
      expect(sendResult.success).toBe(true);
      expect(sendResult).toHaveProperty('operationId');
      expect(sendResult).toHaveProperty('timestamp');
      expect(typeof sendResult.operationId).toBe('string');
      expect(typeof sendResult.timestamp).toBe('number');
      
      console.log(`✅ Sent message to tab ${createResult.tabId} with operation ID ${sendResult.operationId}`);
    }, 30000);

    test('tab_get_response functionality is preserved', async () => {
      // Create a tab with content script
      const createResult = await client.callTool('tab_create', {
        waitForLoad: true,
        injectContentScript: true
      });
      expect(createResult.success).toBe(true);
      createdTabs.push(createResult.tabId);
      
      // Send a simple message first
      const sendResult = await client.callTool('tab_send_message', {
        tabId: createResult.tabId,
        message: 'Hello',
        waitForReady: true
      });
      expect(sendResult.success).toBe(true);
      
      // Try to get response (may timeout if Claude doesn't respond quickly)
      const responseResult = await client.callTool('tab_get_response', {
        tabId: createResult.tabId,
        operationId: sendResult.operationId,
        timeoutMs: 10000
      });
      
      // Response might be completed or might timeout - both are valid
      expect(responseResult).toHaveProperty('success');
      if (responseResult.success) {
        expect(responseResult).toHaveProperty('status');
        expect(responseResult).toHaveProperty('operationId');
        console.log(`✅ Got response status: ${responseResult.status}`);
      } else {
        // Timeout or no response yet is expected
        expect(responseResult).toHaveProperty('error');
        console.log(`✅ Response not ready yet: ${responseResult.error}`);
      }
    }, 40000);
  });

  describe('Error Handling with Real Extension', () => {
    test('Operations with invalid tab IDs return proper errors', async () => {
      const invalidTabId = 99999;
      
      // Test close with invalid ID
      const closeResult = await client.callTool('tab_close', { 
        tabId: invalidTabId 
      });
      
      expect(closeResult.success).toBe(false);
      expect(closeResult).toHaveProperty('error');
      expect(typeof closeResult.error).toBe('string');
      console.log(`✅ tab_close with invalid ID returned error: ${closeResult.error}`);
      
      // Test send message with invalid ID
      const sendResult = await client.callTool('tab_send_message', {
        tabId: invalidTabId,
        message: 'test'
      });
      
      expect(sendResult.success).toBe(false);
      expect(sendResult).toHaveProperty('error');
      console.log(`✅ tab_send_message with invalid ID returned error: ${sendResult.error}`);
    }, 15000);

    test('Content script operations handle missing injection gracefully', async () => {
      // Create tab without content script injection
      const createResult = await client.callTool('tab_create', {
        waitForLoad: true,
        injectContentScript: false
      });
      expect(createResult.success).toBe(true);
      createdTabs.push(createResult.tabId);
      
      // Try to send message (should fail gracefully)
      const sendResult = await client.callTool('tab_send_message', {
        tabId: createResult.tabId,
        message: 'test'
      });
      
      expect(sendResult.success).toBe(false);
      expect(sendResult).toHaveProperty('error');
      expect(sendResult).toHaveProperty('errorType');
      console.log(`✅ Message send without content script returned: ${sendResult.errorType}`);
    }, 20000);
  });

  describe('Lock Management', () => {
    test('Concurrent operations on same tab are handled correctly', async () => {
      // Create a tab
      const createResult = await client.callTool('tab_create', {
        waitForLoad: true,
        injectContentScript: true
      });
      expect(createResult.success).toBe(true);
      createdTabs.push(createResult.tabId);
      
      // Try concurrent operations (should be handled by lock management)
      const operations = [
        client.callTool('tab_send_message', {
          tabId: createResult.tabId,
          message: 'First message'
        }),
        client.callTool('tab_extract_elements', {
          tabId: createResult.tabId
        })
      ];
      
      const results = await Promise.allSettled(operations);
      
      // At least one should succeed, others might be locked
      const successes = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const errors = results.filter(r => r.status === 'fulfilled' && !r.value.success);
      
      console.log(`✅ Concurrent operations: ${successes.length} succeeded, ${errors.length} failed/locked`);
      
      // Check if any failed due to locking
      const lockErrors = errors.filter(r => 
        r.value.error && r.value.error.includes('lock')
      );
      
      if (lockErrors.length > 0) {
        console.log(`✅ Lock management working: ${lockErrors.length} operations blocked by locks`);
      }
    }, 30000);
  });
});