/**
 * Tab Pool for Claude Chrome MCP - Production Version
 * 
 * Manages a pool of ready Claude tabs for improved performance
 * with production-ready features including:
 * - Memory leak fixes
 * - Race condition prevention
 * - Event-based coordination
 * - Better error handling
 * - Configuration via environment variables
 */

const { Logger } = require('./logger');
const EventEmitter = require('events');

class TabPool extends EventEmitter {
  constructor(client, options = {}) {
    super();
    
    this.client = client;
    
    // Configuration with environment variable support
    this.maxSize = parseInt(process.env.TAB_POOL_MAX_SIZE) || options.maxSize || 5;
    this.minSize = parseInt(process.env.TAB_POOL_MIN_SIZE) || options.minSize || 2;
    this.idleTimeout = parseInt(process.env.TAB_POOL_IDLE_TIMEOUT) || options.idleTimeout || 300000; // 5 minutes
    this.warmupDelay = parseInt(process.env.TAB_POOL_WARMUP_DELAY) || options.warmupDelay || 5000; // 5 seconds
    this.maxRetries = parseInt(process.env.TAB_POOL_MAX_RETRIES) || options.maxRetries || 3;
    this.retryDelay = parseInt(process.env.TAB_POOL_RETRY_DELAY) || options.retryDelay || 1000;
    
    // Pool state
    this.available = [];
    this.busy = new Map();
    this.warming = new Map(); // Changed to Map for better tracking
    this.waitQueue = []; // Queue for waiting requests
    this.idleTimers = new Map(); // Track idle timers to prevent leaks
    
    // State management
    this.isShuttingDown = false;
    this.initPromise = null;
    
    this.logger = new Logger('TabPool', { level: options.logLevel });
    this.stats = {
      created: 0,
      reused: 0,
      destroyed: 0,
      timeouts: 0,
      errors: 0,
      queueWaits: 0,
      averageWaitTime: 0
    };
    
    // Initialize pool
    this.initialize();
  }
  
  async initialize() {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this._doInitialize();
    return this.initPromise;
  }
  
  async _doInitialize() {
    this.logger.info('Initializing tab pool', { 
      minSize: this.minSize, 
      maxSize: this.maxSize,
      idleTimeout: this.idleTimeout 
    });
    
    const promises = [];
    for (let i = 0; i < this.minSize; i++) {
      promises.push(this.createTab().catch(err => {
        this.logger.error('Failed to create initial tab', err);
        this.stats.errors++;
      }));
    }
    
    await Promise.allSettled(promises);
    this.logger.info('Tab pool initialized', { available: this.available.length });
  }
  
  async createTab(retryCount = 0) {
    if (this.isShuttingDown) {
      throw new Error('Tab pool is shutting down');
    }
    
    try {
      this.logger.debug('Creating new tab', { attempt: retryCount + 1 });
      
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
        useCount: 0,
        errors: 0
      };
      
      // Track warming tab
      this.warming.set(tabId, tab);
      
      // Warm up the tab
      try {
        await this.warmupTab(tabId);
        this.warming.delete(tabId);
        
        // Add to available pool
        this.available.push(tab);
        this.stats.created++;
        
        this.logger.info('Tab created and ready', { 
          tabId, 
          poolSize: this.available.length 
        });
        
        // Schedule idle check
        this.scheduleIdleCheck(tab);
        
        // Process any waiting requests
        this.processWaitQueue();
        
        return tab;
        
      } catch (warmupError) {
        // Cleanup failed warmup
        this.warming.delete(tabId);
        await this.destroy(tabId);
        throw warmupError;
      }
      
    } catch (error) {
      this.logger.error('Failed to create tab', { 
        error: error.message,
        attempt: retryCount + 1
      });
      
      // Retry with exponential backoff
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.createTab(retryCount + 1);
      }
      
      throw error;
    }
  }
  
  async warmupTab(tabId) {
    this.logger.debug('Warming up tab', { tabId });
    
    // Wait for tab to be ready
    await new Promise(resolve => setTimeout(resolve, this.warmupDelay));
    
    // Verify tab is healthy
    const health = await this.checkTabHealth(tabId);
    if (!health.isHealthy) {
      throw new Error(`Tab ${tabId} failed health check: ${health.reason}`);
    }
  }
  
  async checkTabHealth(tabId) {
    try {
      const result = await this.client.callTool('get_conversation_metadata', {
        tabId: tabId,
        includeMessages: false
      });
      
      const metadata = JSON.parse(result.content[0].text);
      
      return {
        isHealthy: metadata.isActive && !metadata.error,
        reason: metadata.error || null,
        metadata
      };
      
    } catch (error) {
      return {
        isHealthy: false,
        reason: error.message
      };
    }
  }
  
  async acquire() {
    if (this.isShuttingDown) {
      throw new Error('Tab pool is shutting down');
    }
    
    this.logger.debug('Tab requested', {
      available: this.available.length,
      busy: this.busy.size,
      warming: this.warming.size,
      waiting: this.waitQueue.length
    });
    
    // Try to get an available tab
    const availableTab = this.available.shift();
    if (availableTab) {
      return this._activateTab(availableTab);
    }
    
    // Try to create new tab if under limit
    if (this.getTotal() < this.maxSize) {
      try {
        const newTab = await this.createTab();
        this.available.shift(); // Remove from available
        return this._activateTab(newTab);
      } catch (error) {
        this.logger.error('Failed to create tab on demand', error);
        // Fall through to wait queue
      }
    }
    
    // Add to wait queue
    return this._addToWaitQueue();
  }
  
  _activateTab(tab) {
    // Clear any idle timer
    const idleTimer = this.idleTimers.get(tab.id);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(tab.id);
    }
    
    // Update tab state
    tab.lastUsed = Date.now();
    tab.useCount++;
    this.busy.set(tab.id, tab);
    
    if (tab.useCount > 1) {
      this.stats.reused++;
    }
    
    this.logger.debug('Tab activated', { 
      tabId: tab.id, 
      useCount: tab.useCount 
    });
    
    // Replenish pool if needed
    if (this.available.length < this.minSize && this.getTotal() < this.maxSize) {
      this.createTab().catch(err => 
        this.logger.error('Failed to replenish pool', err)
      );
    }
    
    return tab.id;
  }
  
  _addToWaitQueue() {
    const waitStart = Date.now();
    
    return new Promise((resolve, reject) => {
      const request = {
        resolve,
        reject,
        timestamp: waitStart,
        timeout: setTimeout(() => {
          const index = this.waitQueue.indexOf(request);
          if (index !== -1) {
            this.waitQueue.splice(index, 1);
            reject(new Error('Tab acquisition timeout'));
          }
        }, 30000) // 30 second timeout
      };
      
      this.waitQueue.push(request);
      this.stats.queueWaits++;
      
      this.logger.info('Request added to wait queue', { 
        position: this.waitQueue.length 
      });
    });
  }
  
  processWaitQueue() {
    while (this.waitQueue.length > 0 && this.available.length > 0) {
      const request = this.waitQueue.shift();
      const tab = this.available.shift();
      
      if (request && tab) {
        clearTimeout(request.timeout);
        
        // Update wait time stats
        const waitTime = Date.now() - request.timestamp;
        this.stats.averageWaitTime = 
          (this.stats.averageWaitTime * (this.stats.queueWaits - 1) + waitTime) / 
          this.stats.queueWaits;
        
        try {
          const tabId = this._activateTab(tab);
          request.resolve(tabId);
        } catch (error) {
          request.reject(error);
        }
      }
    }
  }
  
  async release(tabId) {
    const tab = this.busy.get(tabId);
    if (!tab) {
      this.logger.warn('Attempted to release unknown tab', { tabId });
      return;
    }
    
    this.busy.delete(tabId);
    tab.lastUsed = Date.now();
    
    if (this.isShuttingDown) {
      await this.destroy(tabId);
      return;
    }
    
    // Check if tab is still healthy
    try {
      const health = await this.checkTabHealth(tabId);
      
      if (!health.isHealthy) {
        throw new Error(health.reason);
      }
      
      // Return to pool
      this.available.push(tab);
      this.logger.debug('Tab released back to pool', { 
        tabId, 
        poolSize: this.available.length 
      });
      
      // Schedule idle check
      this.scheduleIdleCheck(tab);
      
      // Process wait queue
      this.processWaitQueue();
      
    } catch (error) {
      // Tab is unhealthy, destroy it
      tab.errors++;
      this.logger.warn('Released tab is unhealthy, destroying', { 
        tabId, 
        error: error.message,
        errorCount: tab.errors
      });
      await this.destroy(tabId);
    }
  }
  
  async destroy(tabId) {
    try {
      // Clear any idle timer
      const idleTimer = this.idleTimers.get(tabId);
      if (idleTimer) {
        clearTimeout(idleTimer);
        this.idleTimers.delete(tabId);
      }
      
      await this.client.callTool('close_claude_tab', {
        tabId: tabId,
        force: true
      });
      
      this.stats.destroyed++;
      this.logger.info('Tab destroyed', { tabId });
      
    } catch (error) {
      this.logger.error('Failed to destroy tab', { 
        tabId, 
        error: error.message 
      });
    }
  }
  
  scheduleIdleCheck(tab) {
    // Clear any existing timer
    const existingTimer = this.idleTimers.get(tab.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(async () => {
      // Check if tab is still in available pool and idle
      const index = this.available.findIndex(t => t.id === tab.id);
      if (index === -1) return; // Tab is in use or already destroyed
      
      const idleTime = Date.now() - tab.lastUsed;
      if (idleTime >= this.idleTimeout && this.available.length > this.minSize) {
        // Remove from pool and destroy
        this.available.splice(index, 1);
        this.idleTimers.delete(tab.id);
        
        await this.destroy(tab.id);
        this.stats.timeouts++;
        
        this.logger.info('Idle tab destroyed', { 
          tabId: tab.id, 
          idleMinutes: Math.round(idleTime / 60000) 
        });
      }
    }, this.idleTimeout);
    
    this.idleTimers.set(tab.id, timer);
  }
  
  getTotal() {
    return this.available.length + this.busy.size + this.warming.size;
  }
  
  async shutdown() {
    this.logger.info('Shutting down tab pool');
    this.isShuttingDown = true;
    
    // Clear all idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();
    
    // Clear wait queue
    for (const request of this.waitQueue) {
      clearTimeout(request.timeout);
      request.reject(new Error('Tab pool shutting down'));
    }
    this.waitQueue = [];
    
    // Destroy all tabs
    const allTabs = [
      ...this.available,
      ...Array.from(this.busy.values()),
      ...Array.from(this.warming.values())
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
    const now = Date.now();
    const tabStats = [...this.available, ...Array.from(this.busy.values())].map(tab => ({
      id: tab.id,
      age: Math.round((now - tab.createdAt) / 1000),
      useCount: tab.useCount,
      idleTime: Math.round((now - tab.lastUsed) / 1000),
      errors: tab.errors
    }));
    
    return {
      ...this.stats,
      available: this.available.length,
      busy: this.busy.size,
      warming: this.warming.size,
      waiting: this.waitQueue.length,
      total: this.getTotal(),
      config: {
        minSize: this.minSize,
        maxSize: this.maxSize,
        idleTimeout: this.idleTimeout,
        warmupDelay: this.warmupDelay
      },
      tabs: tabStats
    };
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TabPool;
}