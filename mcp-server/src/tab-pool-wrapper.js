/**
 * Tab Pool Wrapper for Claude Chrome MCP
 * 
 * This module wraps the hub client to add tab pool functionality
 * without modifying the core server implementation.
 */

const TabPool = require('../../shared/tab-pool-v2');

class TabPoolWrapper {
  constructor(hubClient, options = {}) {
    this.hubClient = hubClient;
    this.enabled = process.env.TAB_POOL_ENABLED !== '0';
    
    if (this.enabled) {
      this.pool = new TabPool(hubClient, options);
      console.error('Claude Chrome MCP: Tab pool enabled');
    } else {
      this.pool = null;
      console.error('Claude Chrome MCP: Tab pool disabled');
    }
  }
  
  /**
   * Intercept spawn_claude_tab requests to use pool when appropriate
   */
  async handleSpawnRequest(args = {}) {
    if (!this.enabled || args.usePool === false) {
      // Pool disabled or explicitly not requested
      return this.hubClient.sendRequest('spawn_claude_tab', args);
    }
    
    try {
      // Try to acquire from pool
      const tabId = await this.pool.acquire();
      
      // Format response to match expected format
      return {
        success: true,
        id: tabId,
        source: 'pool',
        message: `Created new Claude tab. Tab ID: ${tabId}`,
        poolStats: this.pool.getStats()
      };
      
    } catch (poolError) {
      console.error('Claude Chrome MCP: Tab pool acquire failed:', poolError);
      
      // Fallback to regular spawn
      const result = await this.hubClient.sendRequest('spawn_claude_tab', args);
      return {
        ...result,
        source: 'fresh',
        poolError: poolError.message
      };
    }
  }
  
  /**
   * Release a tab back to the pool
   */
  async releaseTab(tabId) {
    if (!this.enabled) {
      throw new Error('Tab pool is not enabled');
    }
    
    await this.pool.release(tabId);
    return {
      success: true,
      message: `Tab ${tabId} released to pool`,
      poolStats: this.pool.getStats()
    };
  }
  
  /**
   * Get pool statistics
   */
  getStats() {
    if (!this.enabled) {
      return {
        enabled: false,
        message: 'Tab pool is disabled'
      };
    }
    
    return {
      enabled: true,
      ...this.pool.getStats()
    };
  }
  
  /**
   * Shutdown the pool
   */
  async shutdown() {
    if (this.pool) {
      await this.pool.shutdown();
    }
  }
}

module.exports = TabPoolWrapper;