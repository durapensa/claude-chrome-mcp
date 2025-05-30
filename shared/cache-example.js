/**
 * Example of using ResponseCache
 */

const { ResponseCache, withCache } = require('./response-cache');

// Create a cache instance
const cache = new ResponseCache({
  maxSize: 50,
  ttl: 60000, // 1 minute for demo
  logLevel: 'debug'
});

// Example 1: Manual cache usage
async function manualCacheExample() {
  console.log('=== Manual Cache Usage ===\n');
  
  const tabId = 123;
  const message = 'What is the capital of France?';
  
  // First request - cache miss
  let response = cache.get(tabId, message);
  console.log('First request:', response ? 'HIT' : 'MISS');
  
  if (!response) {
    // Simulate API call
    response = {
      success: true,
      text: 'The capital of France is Paris.',
      timestamp: Date.now()
    };
    
    // Store in cache
    cache.set(tabId, message, response);
  }
  
  // Second request - cache hit
  const cached = cache.get(tabId, message);
  console.log('Second request:', cached ? 'HIT' : 'MISS');
  console.log('Response:', cached.text);
  
  console.log('\nCache stats:', cache.getStats());
}

// Example 2: Using cache wrapper
class ClaudeService {
  constructor() {
    this.cache = new ResponseCache({ ttl: 120000 }); // 2 minutes
    
    // Wrap method with caching
    const originalSendMessage = this.sendMessage.bind(this);
    this.sendMessage = async (params) => {
      const cached = this.cache.get(params.tabId, params.message);
      if (cached) {
        console.log('Returning cached response');
        return cached;
      }
      
      const result = await originalSendMessage(params);
      if (result.success) {
        this.cache.set(params.tabId, params.message, result);
      }
      return result;
    };
  }
  
  async sendMessage(params) {
    console.log('Making API call for:', params.message);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      text: `Response to: ${params.message}`,
      timestamp: Date.now()
    };
  }
}

// Example 3: Cache patterns for different scenarios
async function cachePatterns() {
  console.log('\n=== Cache Patterns ===\n');
  
  const cache = new ResponseCache({ maxSize: 3 });
  
  // Pattern 1: Cache similar queries
  const variations = [
    'What is 2+2?',
    'What is 2 + 2?',
    'what is 2+2?',
    'Calculate 2+2'
  ];
  
  console.log('Similar queries (different cache keys):');
  variations.forEach(msg => {
    const key = cache.generateKey(123, msg);
    console.log(`"${msg}" -> ${key}`);
  });
  
  // Pattern 2: Tab-specific caching
  console.log('\nTab-specific caching:');
  cache.set(100, 'Hello', { text: 'Response for tab 100' });
  cache.set(200, 'Hello', { text: 'Response for tab 200' });
  
  console.log('Tab 100:', cache.get(100, 'Hello')?.text);
  console.log('Tab 200:', cache.get(200, 'Hello')?.text);
  
  // Pattern 3: Clear tab cache when closing
  console.log('\nClearing tab cache:');
  cache.clearTab(100);
  console.log('Tab 100 after clear:', cache.get(100, 'Hello'));
  console.log('Tab 200 still cached:', cache.get(200, 'Hello')?.text);
}

// Example 4: Performance comparison
async function performanceTest() {
  console.log('\n=== Performance Test ===\n');
  
  const cache = new ResponseCache();
  const iterations = 1000;
  
  // Simulate expensive operation
  const expensiveOperation = async (message) => {
    // Simulate 10ms processing time
    await new Promise(resolve => setTimeout(resolve, 10));
    return { text: message.toUpperCase() };
  };
  
  // Without cache
  console.time('Without cache');
  for (let i = 0; i < iterations; i++) {
    await expensiveOperation('test message');
  }
  console.timeEnd('Without cache');
  
  // With cache
  console.time('With cache');
  for (let i = 0; i < iterations; i++) {
    const cached = cache.get(1, 'test message');
    if (!cached) {
      const result = await expensiveOperation('test message');
      cache.set(1, 'test message', result);
    }
  }
  console.timeEnd('With cache');
  
  console.log('\nCache stats:', cache.getStats());
}

// Run all examples
async function runExamples() {
  await manualCacheExample();
  await cachePatterns();
  await performanceTest();
  
  // Cleanup
  cache.shutdown();
}

runExamples().catch(console.error);