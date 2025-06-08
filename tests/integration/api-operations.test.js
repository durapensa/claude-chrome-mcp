const { MCPTestClient } = require('../helpers/mcp-test-client');
const { PreFlightCheck } = require('../helpers/pre-flight-check');

describe('API Operations (Requires Extension)', () => {
  let client;
  let testConversationId; // Store a conversation ID for testing
  let createdTabs = []; // Track tabs for cleanup
  
  beforeAll(async () => {
    // Check full integration prerequisites
    const preFlightCheck = new PreFlightCheck();
    
    try {
      const mcpResult = await preFlightCheck.forIntegrationTests();
      console.log(`✅ Integration prerequisites verified (${mcpResult.mcp.toolCount} tools, extension ready)`);
    } catch (error) {
      throw new Error(`Integration prerequisites failed: ${error.message}`);
    }
    
    // Get a conversation ID from the list for testing
    const tempClient = new MCPTestClient();
    await tempClient.connect();
    
    const listResult = await tempClient.callTool('api_list_conversations');
    if (listResult.conversations && listResult.conversations.length > 0) {
      // Pick a conversation that's not currently open to avoid conflicts
      const closedConversation = listResult.conversations.find(c => !c.isOpen);
      if (closedConversation) {
        testConversationId = closedConversation.id;
        console.log(`✅ Found test conversation ID: ${testConversationId}`);
      }
    }
    
    await tempClient.disconnect();
  }, 15000);
  
  afterAll(async () => {
    // Clean up any tabs we created
    if (createdTabs.length > 0) {
      const tempClient = new MCPTestClient();
      await tempClient.connect();
      
      for (const tabId of createdTabs) {
        try {
          await tempClient.callTool('tab_close', { tabId, force: true });
          console.log(`✅ Closed tab ${tabId}`);
        } catch (e) {
          console.log(`Warning: Failed to close tab ${tabId}:`, e.message);
        }
      }
      
      await tempClient.disconnect();
    }
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

  describe('Conversation Search', () => {
    test('Can search conversations by title', async () => {
      const searchResult = await client.callTool('api_search_conversations', {
        titleSearch: 'test',
        limit: 10
      });
      
      expect(searchResult).toBeDefined();
      expect(searchResult.success).toBe(true);
      expect(Array.isArray(searchResult.conversations)).toBe(true);
      expect(searchResult.count).toBe(searchResult.conversations.length);
      
      // If we found any, verify they match search criteria
      if (searchResult.conversations.length > 0) {
        searchResult.conversations.forEach(conv => {
          expect(conv.title.toLowerCase()).toContain('test');
        });
      }
      
      console.log(`✅ Found ${searchResult.count} conversations matching 'test'`);
    }, 20000);
    
    test('Can search with multiple filters', async () => {
      const searchResult = await client.callTool('api_search_conversations', {
        minMessages: 2,
        maxMessages: 50,
        openOnly: false,
        limit: 5
      });
      
      expect(searchResult).toBeDefined();
      expect(searchResult.success).toBe(true);
      expect(Array.isArray(searchResult.conversations)).toBe(true);
      
      // Verify message count filters
      searchResult.conversations.forEach(conv => {
        expect(conv.messageCount).toBeGreaterThanOrEqual(2);
        expect(conv.messageCount).toBeLessThanOrEqual(50);
      });
      
      console.log(`✅ Found ${searchResult.count} conversations with 2-50 messages`);
    }, 20000);
    
    test('Can search by date range', async () => {
      // Search for conversations from the last 7 days
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const searchResult = await client.callTool('api_search_conversations', {
        createdAfter: oneWeekAgo.toISOString(),
        limit: 10
      });
      
      expect(searchResult).toBeDefined();
      expect(searchResult.success).toBe(true);
      expect(Array.isArray(searchResult.conversations)).toBe(true);
      
      // Verify all conversations are recent
      searchResult.conversations.forEach(conv => {
        const createdDate = new Date(conv.createdAt);
        expect(createdDate).toBeInstanceOf(Date);
        expect(createdDate.getTime()).toBeGreaterThan(oneWeekAgo.getTime());
      });
      
      console.log(`✅ Found ${searchResult.count} conversations from the last week`);
    }, 20000);
  });

  describe('Conversation URL Generation', () => {
    test('Can generate URL for conversation', async () => {
      // Skip if we don't have a test conversation ID
      if (!testConversationId) {
        console.log('⚠️ Skipping URL test - no test conversation available');
        return;
      }
      
      const urlResult = await client.callTool('api_get_conversation_url', {
        conversationId: testConversationId
      });
      
      expect(urlResult).toBeDefined();
      expect(urlResult.success).toBe(true);
      expect(urlResult.url).toBeTruthy();
      expect(urlResult.url).toMatch(/^https:\/\/claude\.ai\/chat\//);
      expect(urlResult.url).toContain(testConversationId);
      
      console.log(`✅ Generated URL for conversation: ${urlResult.url}`);
    }, 10000);
    
    test('Can open conversation from generated URL', async () => {
      // Skip if we don't have a test conversation ID
      if (!testConversationId) {
        console.log('⚠️ Skipping open URL test - no test conversation available');
        return;
      }
      
      // Get URL
      const urlResult = await client.callTool('api_get_conversation_url', {
        conversationId: testConversationId
      });
      
      // Open in new tab
      const tabResult = await client.callTool('tab_create', {
        url: urlResult.url,
        waitForLoad: true,
        injectContentScript: true
      });
      
      createdTabs.push(tabResult.tabId);
      
      expect(tabResult.success).toBe(true);
      expect(tabResult.tabId).toBeTruthy();
      
      // Verify we loaded the right conversation
      const tabList = await client.callTool('tab_list');
      const ourTab = tabList.tabs.find(t => t.id === tabResult.tabId);
      expect(ourTab).toBeTruthy();
      expect(ourTab.conversationId).toBe(testConversationId);
      
      console.log(`✅ Opened conversation ${testConversationId} in tab ${tabResult.tabId}`);
    }, 30000);
  });

  describe('Conversation Deletion', () => {
    test('Can delete single conversation', async () => {
      // First, create a test conversation we can safely delete
      const createResult = await client.callTool('tab_create', {
        injectContentScript: true,
        waitForLoad: true
      });
      createdTabs.push(createResult.tabId);
      
      // Send a test message to create a conversation
      await client.callTool('tab_send_message', {
        tabId: createResult.tabId,
        message: "Test message for deletion test",
        waitForCompletion: true
      });
      
      // Get the conversation ID
      const tabList = await client.callTool('tab_list');
      const ourTab = tabList.tabs.find(t => t.id === createResult.tabId);
      const conversationToDelete = ourTab.conversationId;
      
      // Close the tab before deletion
      await client.callTool('tab_close', { tabId: createResult.tabId, force: true });
      createdTabs = createdTabs.filter(id => id !== createResult.tabId);
      
      if (conversationToDelete) {
        // Delete the conversation
        const deleteResult = await client.callTool('api_delete_conversations', {
          conversationIds: [conversationToDelete]
        });
        
        expect(deleteResult).toBeDefined();
        expect(deleteResult.success).toBe(true);
        expect(deleteResult.deleted).toBe(1);
        expect(deleteResult.failed).toBe(0);
        
        console.log(`✅ Deleted test conversation ${conversationToDelete}`);
        
        // Verify it's gone
        const searchResult = await client.callTool('api_search_conversations', {
          titleSearch: "Test message for deletion test"
        });
        
        const stillExists = searchResult.conversations.find(c => c.id === conversationToDelete);
        expect(stillExists).toBeUndefined();
      }
    }, 45000);
    
    test('Handles bulk deletion with progress', async () => {
      // This test demonstrates bulk deletion API but uses empty array to avoid deleting real data
      const deleteResult = await client.callTool('api_delete_conversations', {
        conversationIds: [], // Empty array - won't delete anything
        batchSize: 3,
        delayMs: 500
      });
      
      expect(deleteResult).toBeDefined();
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deleted).toBe(0);
      expect(deleteResult.failed).toBe(0);
      expect(deleteResult.total).toBe(0);
      
      console.log('✅ Bulk deletion API tested (with empty array)');
    }, 10000);
  });

  describe('Error Handling', () => {
    test('Handles invalid conversation ID format', async () => {
      try {
        await client.callTool('api_get_conversation_url', {
          conversationId: 'invalid-id-format'
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toMatch(/invalid|format|uuid/i);
        console.log('✅ Invalid conversation ID error handled correctly');
      }
    }, 10000);
    
    test('Search handles invalid date format', async () => {
      try {
        await client.callTool('api_search_conversations', {
          createdAfter: 'not-a-date'
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toMatch(/date|format|invalid/i);
        console.log('✅ Invalid date format error handled correctly');
      }
    }, 10000);
  });
});