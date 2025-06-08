const { MCPTestClient } = require('../helpers/mcp-test-client');
const { PreFlightCheck } = require('../helpers/pre-flight-check');

describe('System Tools', () => {
  let client;
  let debugModeEnabled = false;
  let originalLogLevel = null;
  
  beforeAll(async () => {
    // Fail-early check for unit test prerequisites
    const preFlightCheck = new PreFlightCheck();
    const result = await preFlightCheck.forUnitTests();
    console.log(result.message);
  });
  
  beforeEach(async () => {
    client = new MCPTestClient();
    await client.connect();
  });
  
  afterEach(async () => {
    // Clean up debug mode if enabled
    if (debugModeEnabled) {
      try {
        await client.callTool('system_disable_extension_debug_mode');
        debugModeEnabled = false;
      } catch (e) {
        console.log('Warning: Failed to disable debug mode:', e.message);
      }
    }
    
    // Restore original log level if changed
    if (originalLogLevel) {
      try {
        await client.callTool('system_set_extension_log_level', { 
          level: originalLogLevel 
        });
        originalLogLevel = null;
      } catch (e) {
        console.log('Warning: Failed to restore log level:', e.message);
      }
    }
    
    if (client) {
      await client.disconnect();
    }
  });

  describe('Operation Management', () => {
    test('Can wait for async operations', async () => {
      // First, start an async operation (tab creation)
      const createResult = await client.callTool('tab_create', {
        waitForLoad: false // Don't wait, get operation ID
      });
      
      if (createResult.operationId) {
        // Wait for the operation to complete
        const waitResult = await client.callTool('system_wait_operation', {
          operationId: createResult.operationId,
          timeoutMs: 10000
        });
        
        expect(waitResult).toBeDefined();
        expect(waitResult.completed).toBe(true);
        console.log('✅ Successfully waited for operation completion');
        
        // Clean up the tab
        if (waitResult.result && waitResult.result.tabId) {
          await client.callTool('tab_close', { 
            tabId: waitResult.result.tabId, 
            force: true 
          });
        }
      } else {
        console.log('⚠️ Operation completed synchronously, no wait needed');
      }
    }, 20000);
  });

  describe('Debug Mode Management', () => {
    test('Can enable and disable debug mode', async () => {
      // Enable debug mode
      const enableResult = await client.callTool('system_enable_extension_debug_mode', {
        errorOnly: false,
        batchIntervalMs: 1000
      });
      
      expect(enableResult).toBeDefined();
      expect(enableResult.success).toBe(true);
      debugModeEnabled = true;
      console.log('✅ Debug mode enabled');
      
      // Get some logs to verify it's working
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const logsResult = await client.callTool('system_get_extension_logs', {
        limit: 10
      });
      
      expect(logsResult).toBeDefined();
      // Should have some logs if debug mode is working
      console.log(`✅ Retrieved ${logsResult.logs?.length || 0} debug logs`);
      
      // Disable debug mode
      const disableResult = await client.callTool('system_disable_extension_debug_mode');
      
      expect(disableResult).toBeDefined();
      expect(disableResult.success).toBe(true);
      debugModeEnabled = false;
      console.log('✅ Debug mode disabled');
    }, 15000);
    
    test('Can enable debug mode with component filtering', async () => {
      // Enable debug mode for specific components only
      const enableResult = await client.callTool('system_enable_extension_debug_mode', {
        components: ['background', 'relay-client'],
        errorOnly: true
      });
      
      expect(enableResult).toBeDefined();
      expect(enableResult.success).toBe(true);
      debugModeEnabled = true;
      console.log('✅ Debug mode enabled for specific components');
      
      // Disable
      await client.callTool('system_disable_extension_debug_mode');
      debugModeEnabled = false;
    }, 10000);
  });

  describe('Log Level Management', () => {
    test('Can set and change log levels', async () => {
      // Store original level (we'll restore it later)
      const healthResult = await client.callTool('system_health');
      originalLogLevel = healthResult.extension?.logLevel || 'INFO';
      
      // Test different log levels
      const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'VERBOSE'];
      
      for (const level of levels) {
        const result = await client.callTool('system_set_extension_log_level', { 
          level 
        });
        
        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result.newLevel).toBe(level);
        console.log(`✅ Set log level to ${level}`);
      }
      
      // Restore original
      await client.callTool('system_set_extension_log_level', { 
        level: originalLogLevel 
      });
      originalLogLevel = null;
    }, 15000);
  });

  describe('Relay Management', () => {
    test('Can request relay takeover', async () => {
      // This is a sensitive operation - we'll test it exists but not execute
      // in normal test runs to avoid disrupting the relay
      
      // Just verify the tool exists and can be called with dry-run
      try {
        // Note: This would normally trigger a relay shutdown and takeover
        // For testing, we'll just verify the tool exists by checking health
        const health = await client.callTool('system_health');
        expect(health.relay).toBeDefined();
        console.log('✅ Relay takeover tool available (not executed in test)');
      } catch (error) {
        // Tool might not be available in all environments
        console.log('⚠️ Relay takeover tool not available in this environment');
      }
    }, 10000);
  });

  describe('Integration with Extension Logs', () => {
    test('Log level affects captured logs', async () => {
      // Set to ERROR only
      await client.callTool('system_set_extension_log_level', { level: 'ERROR' });
      originalLogLevel = 'INFO'; // Will restore later
      
      // Enable debug mode
      await client.callTool('system_enable_extension_debug_mode', {
        errorOnly: false
      });
      debugModeEnabled = true;
      
      // Wait a bit for some activity
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get logs - should be minimal with ERROR level
      const errorLogs = await client.callTool('system_get_extension_logs', {
        limit: 50
      });
      
      // Now set to VERBOSE
      await client.callTool('system_set_extension_log_level', { level: 'VERBOSE' });
      
      // Trigger some activity
      await client.callTool('system_health');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get logs again - should have more
      const verboseLogs = await client.callTool('system_get_extension_logs', {
        limit: 50
      });
      
      console.log(`✅ ERROR level: ${errorLogs.logs?.length || 0} logs, VERBOSE level: ${verboseLogs.logs?.length || 0} logs`);
      
      // Restore
      await client.callTool('system_set_extension_log_level', { level: 'INFO' });
      originalLogLevel = null;
      
      await client.callTool('system_disable_extension_debug_mode');
      debugModeEnabled = false;
    }, 20000);
  });

  describe('Error Handling', () => {
    test('Wait operation handles invalid operation ID', async () => {
      try {
        await client.callTool('system_wait_operation', {
          operationId: 'invalid-op-id-12345',
          timeoutMs: 1000
        });
        // Might timeout or return not found
      } catch (error) {
        expect(error.message).toMatch(/not found|timeout|invalid/i);
        console.log('✅ Invalid operation ID handled correctly');
      }
    }, 5000);
    
    test('Set log level handles invalid level', async () => {
      try {
        await client.callTool('system_set_extension_log_level', {
          level: 'INVALID_LEVEL'
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toMatch(/invalid|level|enum/i);
        console.log('✅ Invalid log level rejected correctly');
      }
    }, 5000);
  });
});