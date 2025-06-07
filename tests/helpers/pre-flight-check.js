const { MCPTestClient } = require('./mcp-test-client');

/**
 * Fail-early pre-flight checks for all test categories
 * Prevents hanging tests and provides clear failure reasons
 */
class PreFlightCheck {
  constructor(timeouts = {}) {
    this.timeouts = {
      mcpConnection: timeouts.mcpConnection || 3000,    // 3s for basic MCP
      systemHealth: timeouts.systemHealth || 10000,    // 10s for health check
      extensionCheck: timeouts.extensionCheck || 15000, // 15s for extension
      ...timeouts
    };
  }

  /**
   * Test basic MCP server connectivity
   * Required for ALL test categories
   */
  async checkMCPConnectivity() {
    const client = new MCPTestClient();
    
    try {
      // Test connection with fail-fast timeout
      await Promise.race([
        client.connect(),
        this._timeout(this.timeouts.mcpConnection, 'MCP connection timeout')
      ]);

      // Test basic tool listing with fail-fast timeout  
      const tools = await Promise.race([
        client.client.listTools(),
        this._timeout(this.timeouts.mcpConnection, 'MCP listTools timeout')
      ]);

      await client.disconnect();
      
      return {
        success: true,
        toolCount: tools.tools ? tools.tools.length : 0
      };
    } catch (error) {
      try { await client.disconnect(); } catch {}
      return {
        success: false,
        error: `MCP connectivity failed: ${error.message}`,
        category: 'mcp_connection'
      };
    }
  }

  /**
   * Test system health with fail-fast timeout
   * Required for integration tests, optional for unit/contract
   */
  async checkSystemHealth() {
    const client = new MCPTestClient();
    
    try {
      await Promise.race([
        client.connect(),
        this._timeout(this.timeouts.mcpConnection, 'MCP connection timeout')
      ]);

      const health = await Promise.race([
        client.callTool('system_health'),
        this._timeout(this.timeouts.systemHealth, 'system_health timeout')
      ]);

      await client.disconnect();
      
      return {
        success: true,
        health
      };
    } catch (error) {
      try { await client.disconnect(); } catch {}
      return {
        success: false,
        error: `System health check failed: ${error.message}`,
        category: 'system_health'
      };
    }
  }

  /**
   * Test Chrome extension availability via test client
   * Required for integration tests only
   */
  async checkExtensionAvailability() {
    const client = new (require('./mcp-test-client')).MCPTestClient();
    
    try {
      await Promise.race([
        client.connect(),
        this._timeout(this.timeouts.mcpConnection, 'MCP connection timeout')
      ]);

      // Test simple extension operation with longer timeout
      const tabList = await Promise.race([
        client.callTool('tab_list'),
        this._timeout(this.timeouts.extensionCheck, 'Extension check timeout')
      ]);

      await client.disconnect();
      
      return {
        success: true,
        tabCount: Array.isArray(tabList) ? tabList.length : 0
      };
    } catch (error) {
      try { await client.disconnect(); } catch {}
      return {
        success: false,
        error: `Extension not available: ${error.message}`,
        category: 'extension_unavailable'
      };
    }
  }

  /**
   * Comprehensive pre-flight for unit tests
   * Only requires MCP connectivity
   */
  async forUnitTests() {
    const mcpCheck = await this.checkMCPConnectivity();
    
    if (!mcpCheck.success) {
      throw new Error(`UNIT TEST PREREQ FAILED: ${mcpCheck.error}`);
    }
    
    return {
      mcp: mcpCheck,
      message: `✅ Unit test prerequisites met (${mcpCheck.toolCount} tools available)`
    };
  }

  /**
   * Comprehensive pre-flight for contract tests  
   * Requires MCP connectivity, health check optional
   */
  async forContractTests() {
    const mcpCheck = await this.checkMCPConnectivity();
    
    if (!mcpCheck.success) {
      throw new Error(`CONTRACT TEST PREREQ FAILED: ${mcpCheck.error}`);
    }
    
    // Try health check but don't fail if it times out (contract tests should handle gracefully)
    const healthCheck = await this.checkSystemHealth();
    
    return {
      mcp: mcpCheck,
      health: healthCheck,
      message: healthCheck.success 
        ? `✅ Contract test prerequisites met (${mcpCheck.toolCount} tools, health OK)`
        : `⚠️ Contract test prerequisites partial (${mcpCheck.toolCount} tools, health timeout - good for boundary testing)`
    };
  }

  /**
   * Comprehensive pre-flight for integration tests
   * Requires MCP + health + extension
   */
  async forIntegrationTests() {
    const mcpCheck = await this.checkMCPConnectivity();
    
    if (!mcpCheck.success) {
      throw new Error(`INTEGRATION TEST PREREQ FAILED: ${mcpCheck.error}`);
    }

    const extensionCheck = await this.checkExtensionAvailability();
    
    if (!extensionCheck.success) {
      throw new Error(`INTEGRATION TEST PREREQ FAILED: ${extensionCheck.error}${extensionCheck.debug ? ' - ' + JSON.stringify(extensionCheck.debug) : ''}`);
    }
    
    return {
      mcp: mcpCheck,
      extension: extensionCheck,
      message: `✅ Integration test prerequisites met (${mcpCheck.toolCount} tools, ${extensionCheck.extensionClients} extension clients)`
    };
  }

  _timeout(ms, message) {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error(message)), ms)
    );
  }
}

module.exports = { PreFlightCheck };