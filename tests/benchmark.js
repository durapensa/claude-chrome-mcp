#!/usr/bin/env node

/**
 * Performance Benchmark for Claude Chrome MCP
 * 
 * Measures performance of key operations
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const TestLifecycle = require('./helpers/lifecycle');

// Benchmark utilities
class Benchmark {
  constructor(name) {
    this.name = name;
    this.runs = [];
    this.startTime = 0;
  }
  
  start() {
    this.startTime = process.hrtime.bigint();
  }
  
  end() {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - this.startTime) / 1_000_000; // Convert to ms
    this.runs.push(duration);
    return duration;
  }
  
  getStats() {
    if (this.runs.length === 0) return null;
    
    const sorted = [...this.runs].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    
    return {
      name: this.name,
      runs: this.runs.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}

// Benchmarks to run
const benchmarks = {
  async tabCreation(client, lifecycle) {
    const bench = new Benchmark('Tab Creation');
    const iterations = 5;
    
    for (let i = 0; i < iterations; i++) {
      bench.start();
      
      const result = await client.callTool('spawn_claude_tab', {});
      const tabIdMatch = result.content[0].text.match(/Tab ID: (\d+)/);
      const tabId = tabIdMatch ? parseInt(tabIdMatch[1]) : null;
      
      const duration = bench.end();
      
      if (tabId) {
        lifecycle.trackTab(tabId);
        console.log(`  Run ${i + 1}: ${duration.toFixed(2)}ms`);
      } else {
        console.log(`  Run ${i + 1}: Failed`);
      }
      
      // Brief pause between runs
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return bench;
  },
  
  async messageSending(client, lifecycle) {
    const bench = new Benchmark('Message Sending');
    const iterations = 5;
    
    // Create a tab for testing
    const spawnResult = await client.callTool('spawn_claude_tab', {});
    const tabIdMatch = spawnResult.content[0].text.match(/Tab ID: (\d+)/);
    const tabId = tabIdMatch ? parseInt(tabIdMatch[1]) : null;
    
    if (!tabId) {
      console.log('  Failed to create test tab');
      return bench;
    }
    
    lifecycle.trackTab(tabId);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for tab to load
    
    for (let i = 0; i < iterations; i++) {
      bench.start();
      
      const result = await client.callTool('send_message_to_claude_tab', {
        tabId: tabId,
        message: `Test message ${i + 1}`,
        waitForReady: true
      });
      
      const duration = bench.end();
      const success = result.content[0].text.includes('"success": true');
      
      console.log(`  Run ${i + 1}: ${duration.toFixed(2)}ms ${success ? '✓' : '✗'}`);
      
      // Wait for Claude to be ready for next message
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    return bench;
  },
  
  async responseRetrieval(client, lifecycle) {
    const bench = new Benchmark('Response Retrieval');
    const iterations = 3;
    
    // Create a tab and send initial message
    const spawnResult = await client.callTool('spawn_claude_tab', {});
    const tabIdMatch = spawnResult.content[0].text.match(/Tab ID: (\d+)/);
    const tabId = tabIdMatch ? parseInt(tabIdMatch[1]) : null;
    
    if (!tabId) {
      console.log('  Failed to create test tab');
      return bench;
    }
    
    lifecycle.trackTab(tabId);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    for (let i = 0; i < iterations; i++) {
      // Send a message
      await client.callTool('send_message_to_claude_tab', {
        tabId: tabId,
        message: `What is ${i + 1} + ${i + 1}?`,
        waitForReady: true
      });
      
      // Measure response retrieval
      bench.start();
      
      const result = await client.callTool('get_claude_response', {
        tabId: tabId,
        waitForCompletion: true,
        timeoutMs: 15000
      });
      
      const duration = bench.end();
      const hasResponse = result.content[0].text.includes('"text":');
      
      console.log(`  Run ${i + 1}: ${duration.toFixed(2)}ms ${hasResponse ? '✓' : '✗'}`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return bench;
  },
  
  async metadataExtraction(client, lifecycle) {
    const bench = new Benchmark('Metadata Extraction');
    const iterations = 10;
    
    // Use existing tabs
    const tabsResult = await client.callTool('get_claude_tabs', {});
    const tabs = JSON.parse(tabsResult.content[0].text);
    
    if (tabs.length === 0) {
      console.log('  No tabs available for testing');
      return bench;
    }
    
    const tabId = tabs[0].id;
    
    for (let i = 0; i < iterations; i++) {
      bench.start();
      
      const result = await client.callTool('get_conversation_metadata', {
        tabId: tabId,
        includeMessages: false
      });
      
      const duration = bench.end();
      const hasData = result.content[0].text.includes('"url":');
      
      console.log(`  Run ${i + 1}: ${duration.toFixed(2)}ms ${hasData ? '✓' : '✗'}`);
      
      // Brief pause
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return bench;
  },
  
  async healthCheck(client, lifecycle) {
    const bench = new Benchmark('Health Check');
    const iterations = 20;
    
    for (let i = 0; i < iterations; i++) {
      bench.start();
      
      const result = await client.callTool('get_connection_health', {});
      
      const duration = bench.end();
      const isHealthy = result.content[0].text.includes('"status": "healthy"');
      
      if (i % 5 === 0) { // Log every 5th run to reduce noise
        console.log(`  Run ${i + 1}: ${duration.toFixed(2)}ms ${isHealthy ? '✓' : '✗'}`);
      }
      
      // Brief pause
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return bench;
  }
};

// Main benchmark runner
async function runBenchmarks() {
  console.log('🏃 Claude Chrome MCP Performance Benchmarks\n');
  
  let client;
  const results = [];
  
  try {
    // Create MCP client
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['../mcp-server/src/server.js']
    });
    
    client = new Client({
      name: 'benchmark',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await client.connect(transport);
    console.log('✅ Connected to MCP server\n');
    
    // Run each benchmark
    for (const [name, benchFn] of Object.entries(benchmarks)) {
      const lifecycle = new TestLifecycle(client);
      
      try {
        await lifecycle.setup();
        
        console.log(`📊 Running: ${name}`);
        const bench = await benchFn(client, lifecycle);
        results.push(bench);
        
      } finally {
        await lifecycle.teardown();
      }
      
      console.log(''); // Blank line between benchmarks
    }
    
    // Print summary
    console.log('═══════════════════════════════════════════════');
    console.log('📈 Benchmark Results Summary\n');
    
    results.forEach(bench => {
      const stats = bench.getStats();
      if (stats && stats.runs > 0) {
        console.log(`${stats.name}:`);
        console.log(`  Runs: ${stats.runs}`);
        console.log(`  Min: ${stats.min.toFixed(2)}ms`);
        console.log(`  Avg: ${stats.avg.toFixed(2)}ms`);
        console.log(`  Median: ${stats.median.toFixed(2)}ms`);
        console.log(`  Max: ${stats.max.toFixed(2)}ms`);
        if (stats.runs >= 10) {
          console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
          console.log(`  P99: ${stats.p99.toFixed(2)}ms`);
        }
        console.log('');
      }
    });
    
    // Save results
    const fs = require('fs').promises;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `./results/benchmark-${timestamp}.json`;
    
    await fs.mkdir('./results', { recursive: true });
    await fs.writeFile(filename, JSON.stringify({
      timestamp: new Date().toISOString(),
      results: results.map(b => b.getStats()).filter(s => s !== null)
    }, null, 2));
    
    console.log(`💾 Results saved to: ${filename}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run benchmarks
runBenchmarks().catch(console.error);