const { MCPTestClient } = require('../helpers/mcp-test-client');
const { PreFlightCheck } = require('../helpers/pre-flight-check');
const { globalTabHygiene, setupTabHygiene, cleanupAllTabs } = require('../helpers/tab-hygiene');

describe('Chrome Tools (Requires Extension)', () => {
  let client;
  let sharedTabId; // Reusable tab for most tests
  let attachedTabs = [];
  let monitoringTabs = [];
  
  beforeAll(async () => {
    // Check full integration prerequisites including MCP connectivity and extension availability
    const preFlightCheck = new PreFlightCheck();
    
    try {
      const mcpResult = await preFlightCheck.forIntegrationTests();
      console.log(`✅ Integration prerequisites verified (${mcpResult.mcp.toolCount} tools, extension ready)`);
      console.log('✅ Extension connectivity confirmed');
    } catch (error) {
      throw new Error(`Integration prerequisites failed: ${error.message}`);
    }
    
    // Initialize tab hygiene
    const tempClient = new MCPTestClient();
    await tempClient.connect();
    await setupTabHygiene(tempClient);
    
    // Get a shared tab for tests that don't need isolation
    sharedTabId = await globalTabHygiene.getSharedTab('chrome-tools');
    
    await tempClient.disconnect();
  }, 15000);
  
  afterAll(async () => {
    // Clean up all tabs created by this test suite
    await cleanupAllTabs();
  }, 10000);
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
    attachedTabs = [];
    monitoringTabs = [];
  });
  
  afterEach(async () => {
    // Clean up debugger attachments
    for (const tabId of attachedTabs) {
      try {
        await client.callTool('chrome_debug_detach', { tabId });
      } catch (e) {
        console.log(`Warning: Failed to detach debugger from tab ${tabId}:`, e.message);
      }
    }
    
    // Clean up network monitoring
    for (const tabId of monitoringTabs) {
      try {
        await client.callTool('chrome_stop_network_monitoring', { tabId });
      } catch (e) {
        console.log(`Warning: Failed to stop monitoring tab ${tabId}:`, e.message);
      }
    }
    
    if (client) {
      await client.disconnect();
    }
  });

  describe('Debugger Operations', () => {
    test('Can attach and detach debugger', async () => {
      // Use shared tab for debugger operations
      const attachResult = await client.callTool('chrome_debug_attach', { tabId: sharedTabId });
      expect(attachResult.success).toBe(true);
      attachedTabs.push(sharedTabId);
      console.log(`✅ Debugger attached to tab ${sharedTabId}${attachResult.alreadyAttached ? ' (already attached)' : ''}`);
      
      // Check debugger status
      const statusResult = await client.callTool('chrome_debug_status', { tabId: sharedTabId });
      expect(Array.isArray(statusResult)).toBe(true);
      expect(statusResult.find(s => s.tabId === sharedTabId)).toBeTruthy();
      console.log('✅ Debugger status verified');
      
      // Detach debugger
      const detachResult = await client.callTool('chrome_debug_detach', { tabId: sharedTabId });
      expect(detachResult.success).toBe(true);
      attachedTabs = attachedTabs.filter(id => id !== sharedTabId);
      console.log(`✅ Debugger detached from tab ${sharedTabId}${detachResult.wasDetached ? '' : ' (was not attached)'}`);
    }, 20000);
    
    test('Can get debugger status for all tabs', async () => {
      const result = await client.callTool('chrome_debug_status');
      expect(Array.isArray(result)).toBe(true);
      console.log(`✅ Found ${result.length} debugger sessions`);
    }, 10000);
  });

  describe('Script Execution', () => {
    test('Can execute JavaScript in tab', async () => {
      const script = `
        const timestamp = Date.now();
        document.title = 'Test Execution ' + timestamp;
        timestamp;
      `;
      
      const result = await client.callTool('chrome_execute_script', { 
        tabId: sharedTabId, 
        script 
      });
      
      expect(result.result).toBeDefined();
      expect(result.result.value).toBeDefined();
      expect(typeof result.result.value).toBe('number');
      console.log('✅ Script executed successfully, returned:', result.result.value);
    }, 15000);
    
    test('Can query DOM elements', async () => {
      // First ensure page has some content
      await client.callTool('chrome_execute_script', {
        tabId: sharedTabId,
        script: `
          document.body.innerHTML = '<div class="test-element">Test Content</div>';
        `
      });
      
      // Query for the element
      const result = await client.callTool('chrome_get_dom_elements', {
        tabId: sharedTabId,
        selector: '.test-element'
      });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].textContent).toMatch(/Test Content/);
      console.log(`✅ Found ${result.length} DOM elements`);
    }, 15000);
  });

  describe('Network Monitoring', () => {
    test('Can start and stop network monitoring', async () => {
      // Create a dedicated tab for network monitoring since we'll navigate
      const networkTestTabId = await globalTabHygiene.createDedicatedTab();
      
      try {
        // Start monitoring
        const startResult = await client.callTool('chrome_start_network_monitoring', { 
          tabId: networkTestTabId 
        });
        expect(startResult.success).toBe(true);
        monitoringTabs.push(networkTestTabId);
        console.log('✅ Network monitoring started');
        
        // Navigate to trigger network requests
        await client.callTool('chrome_execute_script', {
          tabId: networkTestTabId,
          script: `window.location.href = 'https://claude.ai';`
        });
        
        // Wait for some requests to be captured
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get captured requests
        const requestsResult = await client.callTool('chrome_get_network_requests', { 
          tabId: networkTestTabId 
        });
        expect(requestsResult.success).toBe(true);
        expect(Array.isArray(requestsResult.requests)).toBe(true);
        console.log(`✅ Captured ${requestsResult.requests.length} network requests`);
        
        // Stop monitoring
        const stopResult = await client.callTool('chrome_stop_network_monitoring', { 
          tabId: networkTestTabId 
        });
        expect(stopResult.success).toBe(true);
        monitoringTabs = monitoringTabs.filter(id => id !== networkTestTabId);
        console.log('✅ Network monitoring stopped');
      } finally {
        // Tab will be cleaned up automatically by tab hygiene
        await globalTabHygiene.cleanupTab(networkTestTabId);
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    test('Script execution handles errors gracefully', async () => {
      const script = `throw new Error('Test error');`;
      
      try {
        await client.callTool('chrome_execute_script', { 
          tabId: sharedTabId, 
          script 
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toMatch(/Test error|Uncaught/i);
        console.log('✅ Script error handled correctly');
      }
    }, 10000);
    
    test('DOM query handles non-existent elements', async () => {
      const result = await client.callTool('chrome_get_dom_elements', {
        tabId: sharedTabId,
        selector: '.non-existent-element-xyz'
      });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
      console.log('✅ Non-existent element query handled correctly');
    }, 10000);
    
    test('Debugger operations handle invalid tab ID', async () => {
      const invalidTabId = 999999;
      
      try {
        await client.callTool('chrome_debug_attach', { tabId: invalidTabId });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toMatch(/tab|not found|invalid|no tab/i);
        console.log('✅ Invalid tab ID error handled correctly');
      }
    }, 10000);
  });
});