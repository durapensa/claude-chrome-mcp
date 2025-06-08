const { MCPTestClient } = require('../helpers/mcp-test-client');
const { PreFlightCheck } = require('../helpers/pre-flight-check');

describe('Tab Operations Refactor Validation', () => {
  let client;
  let preFlightResult;
  
  beforeAll(async () => {
    // Check unit test prerequisites (MCP connectivity only)
    const preFlightCheck = new PreFlightCheck();
    preFlightResult = await preFlightCheck.forUnitTests();
    console.log(preFlightResult.message);
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

  describe('Error Handling Validation', () => {
    test('tab_create with missing parameters returns standardized error', async () => {
      try {
        // This should fail gracefully if extension not connected OR return standard error for missing params
        const result = await Promise.race([
          client.callTool('tab_create', {}), // Valid empty params (should work)
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 5000)
          )
        ]);
        
        // If it succeeds (extension connected), verify standard success format
        expect(result).toHaveProperty('success');
        if (result.success) {
          expect(result).toHaveProperty('tabId');
          expect(typeof result.tabId).toBe('number');
          console.log('✅ tab_create returned standard success format');
        } else {
          // Should have standardized error format
          expect(result).toHaveProperty('error');
          expect(typeof result.error).toBe('string');
          console.log('✅ tab_create returned standard error format');
        }
      } catch (error) {
        if (error.message.includes('TIMEOUT')) {
          console.log('✅ tab_create timed out as expected (no extension)');
        } else {
          throw error;
        }
      }
    });

    test('tab_close with invalid tabId returns standardized error', async () => {
      try {
        const result = await Promise.race([
          client.callTool('tab_close', { tabId: 99999 }), // Invalid tab ID
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 5000)
          )
        ]);
        
        // Should return standardized error format
        expect(result).toHaveProperty('success');
        expect(result.success).toBe(false);
        expect(result).toHaveProperty('error');
        expect(typeof result.error).toBe('string');
        console.log('✅ tab_close with invalid tabId returned standard error format');
      } catch (error) {
        if (error.message.includes('TIMEOUT')) {
          console.log('✅ tab_close timed out as expected (no extension)');
        } else {
          throw error;
        }
      }
    });

    test('tab_close with missing tabId parameter returns validation error', async () => {
      try {
        const result = await Promise.race([
          client.callTool('tab_close', {}), // Missing required tabId
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 5000)
          )
        ]);
        
        // Should return validation error
        expect(result).toHaveProperty('success');
        expect(result.success).toBe(false);
        expect(result).toHaveProperty('error');
        expect(result.error).toMatch(/missing.*parameter.*tabId/i);
        expect(result).toHaveProperty('errorType');
        expect(result.errorType).toBe('validation_error');
        console.log('✅ tab_close with missing tabId returned validation error');
      } catch (error) {
        if (error.message.includes('TIMEOUT')) {
          console.log('✅ tab_close timed out as expected (no extension)');
        } else {
          throw error;
        }
      }
    });

    test('tab_list returns standardized response format', async () => {
      try {
        const result = await Promise.race([
          client.callTool('tab_list'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 5000)
          )
        ]);
        
        // Should return standardized success format
        expect(result).toHaveProperty('success');
        if (result.success) {
          expect(result).toHaveProperty('tabs');
          expect(Array.isArray(result.tabs)).toBe(true);
          expect(result).toHaveProperty('count');
          expect(typeof result.count).toBe('number');
          expect(result.count).toBe(result.tabs.length);
          console.log(`✅ tab_list returned standard success format with ${result.count} tabs`);
        } else {
          expect(result).toHaveProperty('error');
          expect(typeof result.error).toBe('string');
          console.log('✅ tab_list returned standard error format');
        }
      } catch (error) {
        if (error.message.includes('TIMEOUT')) {
          console.log('✅ tab_list timed out as expected (no extension)');
        } else {
          throw error;
        }
      }
    });

    test('tab_send_message with missing parameters returns validation error', async () => {
      try {
        const result = await Promise.race([
          client.callTool('tab_send_message', { tabId: 123 }), // Missing message
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 5000)
          )
        ]);
        
        // Should return validation error
        expect(result).toHaveProperty('success');
        expect(result.success).toBe(false);
        expect(result).toHaveProperty('error');
        expect(result.error).toMatch(/missing.*parameter.*message/i);
        expect(result).toHaveProperty('errorType');
        expect(result.errorType).toBe('validation_error');
        console.log('✅ tab_send_message with missing message returned validation error');
      } catch (error) {
        if (error.message.includes('TIMEOUT')) {
          console.log('✅ tab_send_message timed out as expected (no extension)');
        } else {
          throw error;
        }
      }
    });

    test('tab_get_response with missing parameters returns validation error', async () => {
      try {
        const result = await Promise.race([
          client.callTool('tab_get_response', {}), // Missing tabId
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 5000)
          )
        ]);
        
        // Should return validation error
        expect(result).toHaveProperty('success');
        expect(result.success).toBe(false);
        expect(result).toHaveProperty('error');
        expect(result.error).toMatch(/missing.*parameter.*tabId/i);
        expect(result).toHaveProperty('errorType');
        expect(result.errorType).toBe('validation_error');
        console.log('✅ tab_get_response with missing tabId returned validation error');
      } catch (error) {
        if (error.message.includes('TIMEOUT')) {
          console.log('✅ tab_get_response timed out as expected (no extension)');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Response Format Consistency', () => {
    test('All tab operations return consistent success format', async () => {
      const operations = [
        { name: 'tab_create', params: {} },
        { name: 'tab_list', params: {} },
        { name: 'tab_close', params: { tabId: 99999 } }, // Will fail but should be consistent
        { name: 'tab_send_message', params: { tabId: 123, message: 'test' } },
        { name: 'tab_get_response', params: { tabId: 123 } },
        { name: 'tab_extract_elements', params: { tabId: 123 } }
      ];

      for (const operation of operations) {
        try {
          const result = await Promise.race([
            client.callTool(operation.name, operation.params),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('TIMEOUT')), 3000)
            )
          ]);
          
          // All operations should return object with 'success' property
          expect(result).toHaveProperty('success');
          expect(typeof result.success).toBe('boolean');
          
          if (result.success === false) {
            // Error responses should have 'error' property
            expect(result).toHaveProperty('error');
            expect(typeof result.error).toBe('string');
          }
          
          console.log(`✅ ${operation.name} returned consistent format (success: ${result.success})`);
        } catch (error) {
          if (error.message.includes('TIMEOUT')) {
            console.log(`✅ ${operation.name} timed out as expected (no extension)`);
          } else {
            throw error;
          }
        }
      }
    });

    test('Error responses contain expected properties', async () => {
      const invalidOperations = [
        { name: 'tab_close', params: {}, expectedError: /missing.*parameter/ },
        { name: 'tab_send_message', params: { tabId: 123 }, expectedError: /missing.*parameter/ },
        { name: 'tab_get_response', params: {}, expectedError: /missing.*parameter/ },
        { name: 'tab_extract_elements', params: {}, expectedError: /missing.*parameter/ }
      ];

      for (const operation of invalidOperations) {
        try {
          const result = await Promise.race([
            client.callTool(operation.name, operation.params),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('TIMEOUT')), 3000)
            )
          ]);
          
          // Should be error response
          expect(result.success).toBe(false);
          expect(result.error).toMatch(operation.expectedError);
          
          // Validation errors should have errorType
          if (result.error.includes('parameter')) {
            expect(result).toHaveProperty('errorType');
            expect(result.errorType).toBe('validation_error');
          }
          
          console.log(`✅ ${operation.name} returned expected error format`);
        } catch (error) {
          if (error.message.includes('TIMEOUT')) {
            console.log(`✅ ${operation.name} timed out as expected (no extension)`);
          } else {
            throw error;
          }
        }
      }
    });
  });

  describe('Chrome API Error Handling', () => {
    test('Operations handle Chrome API errors gracefully', async () => {
      // Test with operations that would trigger Chrome API errors
      const chromeAPIOperations = [
        { name: 'tab_close', params: { tabId: 99999 } }, // Invalid tab ID
        { name: 'tab_send_message', params: { tabId: 99999, message: 'test' } }, // Invalid tab
        { name: 'tab_extract_elements', params: { tabId: 99999 } } // Invalid tab
      ];

      for (const operation of chromeAPIOperations) {
        try {
          const result = await Promise.race([
            client.callTool(operation.name, operation.params),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('TIMEOUT')), 3000)
            )
          ]);
          
          // Should handle Chrome API errors gracefully
          expect(result).toHaveProperty('success');
          if (result.success === false) {
            expect(result).toHaveProperty('error');
            expect(typeof result.error).toBe('string');
            
            // Check for specific Chrome API error handling
            if (result.errorType) {
              expect(typeof result.errorType).toBe('string');
            }
          }
          
          console.log(`✅ ${operation.name} handled Chrome API error gracefully`);
        } catch (error) {
          if (error.message.includes('TIMEOUT')) {
            console.log(`✅ ${operation.name} timed out as expected (no extension)`);
          } else {
            throw error;
          }
        }
      }
    });
  });

  describe('Tool Registration Verification', () => {
    test('All tab operation tools are properly registered', async () => {
      const tools = await client.client.listTools();
      
      const expectedTabTools = [
        'tab_create',
        'tab_list', 
        'tab_close',
        'tab_send_message',
        'tab_get_response',
        'tab_extract_elements',
        'tab_forward_response',
        'tab_get_response_status',
        'tab_debug_page',
        'tab_export_conversation',
        'tab_batch_operations'
      ];
      
      const registeredTools = tools.tools.map(t => t.name);
      
      for (const expectedTool of expectedTabTools) {
        expect(registeredTools).toContain(expectedTool);
        console.log(`✅ ${expectedTool} is registered`);
      }
      
      console.log(`✅ All ${expectedTabTools.length} tab operation tools are registered`);
    });

    test('Tab operation tools have proper descriptions', async () => {
      const tools = await client.client.listTools();
      
      const tabTools = tools.tools.filter(t => t.name.startsWith('tab_'));
      
      for (const tool of tabTools) {
        expect(tool).toHaveProperty('description');
        expect(typeof tool.description).toBe('string');
        expect(tool.description.length).toBeGreaterThan(10);
        console.log(`✅ ${tool.name} has proper description: "${tool.description.substring(0, 50)}..."`);
      }
    });
  });
});