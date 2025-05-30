/**
 * Tab Pool for Claude Chrome MCP
 * 
 * Manages a pool of ready Claude tabs for improved performance
 */

const { Logger } = require('./logger');

class TabPool {
  constructor(client, options = {}) {
    this.client = client;
    this.maxSize = options.maxSize || 3;
    this.minSize = options.minSize || 1;
    this.idleTimeout = options.idleTimeout || 300000; // 5 minutes
    this.warmupDelay = options.warmupDelay || 5000; // 5 seconds
    
    this.available = [];
    this.busy = new Map();
    this.warming = new Set();
    
    this.logger = new Logger('TabPool', { level: options.logLevel });
    this.stats = {
      created: 0,
      reused: 0,
      destroyed: 0,
      timeouts: 0
    };
    
    // Start with minimum pool size
    this.initialize();
  }
  
  async initialize() {
    this.logger.info('Initializing tab pool', { minSize: this.minSize });
    
    for (let i = 0; i < this.minSize; i++) {
      this.createTab().catch(err => 
        this.logger.error('Failed to create initial tab', err)
      );
    }
  }
  
  async createTab() {
    try {
      this.logger.debug('Creating new tab');
      
      const result = await this.client.callTool('spawn_claude_tab', {});
      const tabIdMatch = result.content[0].text.match(/Tab ID: (\d+)/);
      const tabId = tabIdMatch ? parseInt(tabIdMatch[1]) : null;
      
      if (!tabId) {
        throw new Error('Failed to extract tab ID');
      }
      
      const tab = {
        id: tabId,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        useCount: 0
      };
      
      // Warm up the tab
      this.warming.add(tabId);
      await new Promise(resolve => setTimeout(resolve, this.warmupDelay));
      this.warming.delete(tabId);
      
      this.available.push(tab);
      this.stats.created++;
      
      this.logger.info('Tab created and ready', { tabId, poolSize: this.available.length });
      
      // Set idle timeout
      this.scheduleIdleCheck(tab);
      
      return tab;
      
    } catch (error) {
      this.logger.error('Failed to create tab', { error: error.message });
      throw error;
    }
  }
  
  async acquire() {
    this.logger.debug('Tab requested', {
      available: this.available.length,
      busy: this.busy.size,
      warming: this.warming.size
    });
    
    // Try to get an available tab
    if (this.available.length > 0) {
      const tab = this.available.shift();
      tab.lastUsed = Date.now();
      tab.useCount++;
      this.busy.set(tab.id, tab);
      this.stats.reused++;
      
      this.logger.debug('Reusing existing tab', { tabId: tab.id, useCount: tab.useCount });
      
      // Replenish pool if below minimum
      if (this.available.length < this.minSize && this.getTotal() < this.maxSize) {
        this.createTab().catch(err => 
          this.logger.error('Failed to replenish pool', err)
        );
      }
      
      return tab.id;
    }
    
    // Create new tab if under limit
    if (this.getTotal() < this.maxSize) {
      const tab = await this.createTab();
      this.available.shift(); // Remove from available
      tab.lastUsed = Date.now();
      tab.useCount++;
      this.busy.set(tab.id, tab);
      return tab.id;
    }
    
    // Wait for a tab to become available
    this.logger.info('Pool at capacity, waiting for available tab');
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(checkInterval);
          resolve(this.acquire());
        }
      }, 1000);
    });
  }
  
  async release(tabId) {
    const tab = this.busy.get(tabId);
    if (!tab) {
      this.logger.warn('Attempted to release unknown tab', { tabId });
      return;
    }
    
    this.busy.delete(tabId);
    tab.lastUsed = Date.now();
    
    // Check if tab is still healthy
    try {
      const result = await this.client.callTool('get_conversation_metadata', {
        tabId: tabId,
        includeMessages: false
      });
      
      const metadata = JSON.parse(result.content[0].text);
      if (!metadata.isActive) {
        throw new Error('Tab is not active');
      }
      
      // Return to pool
      this.available.push(tab);
      this.logger.debug('Tab released back to pool', { tabId, poolSize: this.available.length });
      
      // Schedule idle check
      this.scheduleIdleCheck(tab);
      
    } catch (error) {
      // Tab is unhealthy, destroy it
      this.logger.warn('Released tab is unhealthy, destroying', { tabId, error: error.message });
      await this.destroy(tabId);
    }
  }
  
  async destroy(tabId) {
    try {
      await this.client.callTool('close_claude_tab', {
        tabId: tabId,
        force: true
      });
      
      this.stats.destroyed++;
      this.logger.info('Tab destroyed', { tabId });
      
    } catch (error) {
      this.logger.error('Failed to destroy tab', { tabId, error: error.message });
    }
  }
  
  scheduleIdleCheck(tab) {
    setTimeout(async () => {
      // Check if tab is still in available pool and idle
      const index = this.available.findIndex(t => t.id === tab.id);
      if (index === -1) return; // Tab is in use or already destroyed
      
      const idleTime = Date.now() - tab.lastUsed;
      if (idleTime >= this.idleTimeout && this.available.length > this.minSize) {
        // Remove from pool and destroy
        this.available.splice(index, 1);
        await this.destroy(tab.id);
        this.stats.timeouts++;
        
        this.logger.info('Idle tab destroyed', { 
          tabId: tab.id, 
          idleMinutes: Math.round(idleTime / 60000) 
        });
      }
    }, this.idleTimeout);
  }
  
  getTotal() {
    return this.available.length + this.busy.size + this.warming.size;
  }
  
  async shutdown() {
    this.logger.info('Shutting down tab pool');
    
    // Destroy all tabs
    const allTabs = [
      ...this.available,
      ...Array.from(this.busy.values())
    ];
    
    await Promise.all(
      allTabs.map(tab => this.destroy(tab.id))
    );
    
    this.available = [];
    this.busy.clear();
    this.warming.clear();
    
    this.logger.info('Tab pool shutdown complete', this.stats);
  }
  
  getStats() {
    return {
      ...this.stats,
      available: this.available.length,
      busy: this.busy.size,
      warming: this.warming.size,
      total: this.getTotal(),
      averageUseCount: this.available.reduce((sum, tab) => sum + tab.useCount, 0) / 
                       (this.available.length || 1)
    };
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TabPool;
}