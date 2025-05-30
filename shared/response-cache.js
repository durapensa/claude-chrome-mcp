/**
 * Response Cache for Claude Chrome MCP
 * 
 * Caches responses for repeated queries to improve performance
 */

const crypto = require('crypto');
const { Logger } = require('./logger');

class ResponseCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || 300000; // 5 minutes default
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired: 0
    };
    
    this.logger = new Logger('ResponseCache', { level: options.logLevel });
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Every minute
  }
  
  /**
   * Generate cache key from message content
   */
  generateKey(tabId, message) {
    const hash = crypto.createHash('sha256');
    hash.update(`${tabId}:${message}`);
    return hash.digest('hex').substring(0, 16);
  }
  
  /**
   * Get cached response if available and not expired
   */
  get(tabId, message) {
    const key = this.generateKey(tabId, message);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.logger.debug('Cache miss', { key, message: message.substring(0, 50) });
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.expired++;
      this.logger.debug('Cache entry expired', { key, age: Date.now() - entry.timestamp });
      return null;
    }
    
    // Update access time for LRU
    entry.lastAccess = Date.now();
    entry.accessCount++;
    
    this.stats.hits++;
    this.logger.debug('Cache hit', { 
      key, 
      accessCount: entry.accessCount,
      age: Date.now() - entry.timestamp 
    });
    
    return entry.response;
  }
  
  /**
   * Store response in cache
   */
  set(tabId, message, response) {
    const key = this.generateKey(tabId, message);
    
    // Check cache size and evict if necessary
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    const entry = {
      key,
      tabId,
      message,
      response,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      accessCount: 0,
      size: JSON.stringify(response).length
    };
    
    this.cache.set(key, entry);
    this.logger.debug('Cached response', { 
      key, 
      size: entry.size,
      cacheSize: this.cache.size 
    });
  }
  
  /**
   * Evict least recently used entry
   */
  evictLRU() {
    let lruKey = null;
    let lruTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
      this.logger.debug('Evicted LRU entry', { key: lruKey });
    }
  }
  
  /**
   * Remove expired entries
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        removed++;
        this.stats.expired++;
      }
    }
    
    if (removed > 0) {
      this.logger.info('Cleaned up expired entries', { removed, remaining: this.cache.size });
    }
  }
  
  /**
   * Clear entire cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.info('Cache cleared', { entries: size });
  }
  
  /**
   * Clear cache for specific tab
   */
  clearTab(tabId) {
    let removed = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tabId === tabId) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      this.logger.info('Cleared tab cache', { tabId, removed });
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const avgAccessCount = entries.reduce((sum, entry) => sum + entry.accessCount, 0) / (entries.length || 1);
    
    return {
      ...this.stats,
      size: this.cache.size,
      totalSize,
      avgAccessCount: Math.round(avgAccessCount),
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
    };
  }
  
  /**
   * Shutdown and cleanup
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
    this.logger.info('Cache shutdown', this.getStats());
  }
}

/**
 * Decorator to add caching to a function
 */
function withCache(cache, extractKey) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args) {
      // Extract cache key
      const { tabId, message } = extractKey(...args);
      
      // Check cache
      const cached = cache.get(tabId, message);
      if (cached) {
        return cached;
      }
      
      // Call original method
      const result = await originalMethod.apply(this, args);
      
      // Cache successful results
      if (result && result.success) {
        cache.set(tabId, message, result);
      }
      
      return result;
    };
    
    return descriptor;
  };
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ResponseCache,
    withCache
  };
}