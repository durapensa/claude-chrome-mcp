const { MCPTestClient } = require('../helpers/mcp-test-client');

describe('Message Send and Receive', () => {
  let client;
  let tabId;
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
    
    // Create a tab for all tests
    const result = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    tabId = result.tabId;
  });
  
  afterEach(async () => {
    await client.cleanup();
    await client.disconnect();
  });

  test('Send message synchronously and get complete response', async () => {
    // Send message and wait for completion
    await client.callTool('tab_send_message', {
      tabId,
      message: "What is 5 + 3?",
      waitForCompletion: true
    });
    
    // Get response immediately
    const response = await client.callTool('tab_get_response', { tabId });
    
    expect(response.completed).toBe(true);
    expect(response.content).toContain('8');
    expect(response.isGenerating).toBe(false);
  });

  test('Send message asynchronously and poll for completion', async () => {
    // Send message without waiting
    await client.callTool('tab_send_message', {
      tabId,
      message: "Count from 1 to 5",
      waitForCompletion: false
    });
    
    // Poll for response status
    let response;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      response = await client.callTool('tab_get_response', { tabId });
      
      if (response.completed) {
        break;
      }
      
      // Check status while generating
      const status = await client.callTool('tab_get_response_status', { tabId });
      expect(status.isResponding).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    expect(response.completed).toBe(true);
    expect(response.content).toMatch(/1.*2.*3.*4.*5/);
  });

  test('Send multiple messages in sequence', async () => {
    // First message
    await client.callTool('tab_send_message', {
      tabId,
      message: "Remember the number 42",
      waitForCompletion: true
    });
    
    const response1 = await client.callTool('tab_get_response', { tabId });
    expect(response1.completed).toBe(true);
    
    // Second message referencing the first
    await client.callTool('tab_send_message', {
      tabId,
      message: "What number did I just ask you to remember?",
      waitForCompletion: true
    });
    
    const response2 = await client.callTool('tab_get_response', { tabId });
    expect(response2.completed).toBe(true);
    expect(response2.content).toContain('42');
  });

  test('Handle message retry on failure', async () => {
    let retryCount = 0;
    const maxRetries = 3;
    let success = false;
    
    while (retryCount < maxRetries && !success) {
      try {
        await client.callTool('tab_send_message', {
          tabId,
          message: "Quick test",
          waitForCompletion: true,
          maxRetries: 1,
          retryDelayMs: 500
        });
        success = true;
      } catch (error) {
        retryCount++;
        if (retryCount === maxRetries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    expect(success).toBe(true);
  });

  test('Forward response between tabs', async () => {
    // Create target tab
    const { tabId: targetTabId } = await client.callTool('tab_create', {
      waitForLoad: true,
      injectContentScript: true
    });
    
    // Send message to source tab
    await client.callTool('tab_send_message', {
      tabId,
      message: "Generate a haiku about coding",
      waitForCompletion: true
    });
    
    // Forward response to target tab
    await client.callTool('tab_forward_response', {
      sourceTabId: tabId,
      targetTabId: targetTabId,
      transformTemplate: "Here's a haiku someone else generated: {{response}}"
    });
    
    // Wait for forward to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get response from target tab
    const targetResponse = await client.callTool('tab_get_response', { tabId: targetTabId });
    expect(targetResponse.content).toContain("haiku");
  });

  test('Get response status during generation', async () => {
    // Send a message that takes time to generate
    await client.callTool('tab_send_message', {
      tabId,
      message: "Write a short paragraph about space exploration",
      waitForCompletion: false
    });
    
    // Check status multiple times during generation
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const status = await client.callTool('tab_get_response_status', { tabId });
      statuses.push(status);
      
      if (status.completed) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Should have seen at least one "generating" status
    expect(statuses.some(s => s.isResponding)).toBe(true);
    
    // Final status should be completed
    const finalStatus = statuses[statuses.length - 1];
    expect(finalStatus.completed || statuses.some(s => s.completed)).toBe(true);
  });
});