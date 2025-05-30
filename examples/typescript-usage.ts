/**
 * Example: Using Claude Chrome MCP with TypeScript
 * 
 * This example demonstrates type-safe usage of the Claude Chrome MCP APIs
 */

import {
  // Parameter types
  SpawnClaudeTabParams,
  SendMessageToClaudeTabParams,
  GetClaudeResponseParams,
  BatchSendMessagesParams,
  
  // Response types
  SpawnClaudeTabResponse,
  SendMessageResponse,
  ClaudeResponseData,
  ConnectionHealth,
  TabPoolStats,
  
  // Utility types and guards
  MCPToolRequest,
  MCPToolResponse,
  isErrorResponse,
  isSpawnTabResponse
} from '../shared';

// Example 1: Basic tab management with types
async function createAndMessageTab(client: any): Promise<void> {
  // Type-safe spawn parameters
  const spawnParams: SpawnClaudeTabParams = {
    url: 'https://claude.ai/new',
    usePool: true
  };
  
  try {
    // Spawn a new tab
    const spawnRequest: MCPToolRequest = {
      name: 'spawn_claude_tab',
      arguments: spawnParams
    };
    
    const spawnResult = await client.callTool(spawnRequest.name, spawnRequest.arguments);
    
    // Type-safe response handling
    if (isSpawnTabResponse(spawnResult)) {
      console.log(`✅ Tab created: ${spawnResult.id} (source: ${spawnResult.source})`);
      
      // Send a message to the tab
      const messageParams: SendMessageToClaudeTabParams = {
        tabId: spawnResult.id,
        message: 'Hello Claude! Can you help me with TypeScript?',
        waitForReady: true,
        maxRetries: 3
      };
      
      const messageResult = await client.callTool('send_message_to_claude_tab', messageParams);
      console.log('Message sent:', messageResult);
      
      // Get the response
      const responseParams: GetClaudeResponseParams = {
        tabId: spawnResult.id,
        waitForCompletion: true,
        timeoutMs: 30000,
        includeMetadata: true
      };
      
      const response = await client.callTool('get_claude_response', responseParams) as ClaudeResponseData;
      console.log('Claude responded:', response.response);
      
      if (response.metadata) {
        console.log(`Response time: ${response.metadata.duration}ms`);
        console.log(`Model: ${response.metadata.model}`);
      }
    }
  } catch (error) {
    console.error('Operation failed:', error);
  }
}

// Example 2: Batch operations with proper typing
async function batchMessaging(client: any, tabIds: number[]): Promise<void> {
  const batchParams: BatchSendMessagesParams = {
    messages: tabIds.map((id, index) => ({
      tabId: id,
      message: `Message ${index + 1}: Testing batch operations`
    })),
    sequential: false // Send in parallel
  };
  
  const result = await client.callTool('batch_send_messages', batchParams);
  
  console.log(`Batch complete: ${result.summary.successful}/${result.summary.total} successful`);
  
  // Type-safe iteration over results
  result.results.forEach(res => {
    if (res.success) {
      console.log(`✅ Tab ${res.tabId}: Success`);
    } else {
      console.log(`❌ Tab ${res.tabId}: ${res.error}`);
    }
  });
}

// Example 3: Health monitoring with types
async function monitorHealth(client: any): Promise<void> {
  const health = await client.callTool('get_connection_health', {}) as ConnectionHealth;
  
  if (!health.success || !health.health) {
    console.error('❌ Health check failed');
    return;
  }
  
  const { hub, clients, status, issues } = health.health;
  
  console.log('🏥 System Health Check:');
  console.log(`- Status: ${status}`);
  console.log(`- Hub: ${hub.connected ? 'Connected' : 'Disconnected'} to ${hub.url}`);
  console.log(`- Clients: ${clients.total} connected`);
  console.log(`- Issues: ${issues.length === 0 ? 'None' : issues.join(', ')}`);
  
  // Type-safe client list access
  clients.list.forEach(client => {
    const idleTime = Date.now() - client.lastActivity;
    console.log(`  - ${client.name} (${client.type}): idle ${Math.round(idleTime / 1000)}s`);
  });
}

// Example 4: Error handling with type guards
async function safeToolCall<T>(
  client: any,
  toolName: string,
  params: any
): Promise<T | null> {
  try {
    const response = await client.callTool(toolName, params);
    
    // Check for error response
    if (isErrorResponse(response)) {
      console.error(`Tool ${toolName} failed:`, response.error);
      return null;
    }
    
    return response as T;
  } catch (error) {
    console.error(`Exception calling ${toolName}:`, error);
    return null;
  }
}

// Example 5: Tab pool management
async function manageTabPool(client: any): Promise<void> {
  // Get current stats with proper typing
  const stats = await safeToolCall<TabPoolStats>(client, 'get_tab_pool_stats', {});
  
  if (stats) {
    console.log('📊 Tab Pool Statistics:');
    console.log(`- Available: ${stats.available}/${stats.total}`);
    console.log(`- Reuse rate: ${(stats.reused / (stats.created || 1) * 100).toFixed(1)}%`);
    console.log(`- Average wait time: ${stats.averageWaitTime}ms`);
    
    // Configure pool if needed
    if (stats.available < 2 && stats.total < stats.config.maxSize) {
      console.log('⚠️  Low availability, adjusting pool size...');
      
      await client.callTool('configure_tab_pool', {
        minSize: Math.min(stats.config.minSize + 1, 5),
        maxSize: Math.min(stats.config.maxSize + 2, 10)
      });
    }
  }
}

// Example usage
async function main() {
  // Assume we have an MCP client instance
  const client = {} as any; // Your actual MCP client
  
  // Run examples
  await createAndMessageTab(client);
  await monitorHealth(client);
  await manageTabPool(client);
}

// Type-safe exports
export {
  createAndMessageTab,
  batchMessaging,
  monitorHealth,
  safeToolCall,
  manageTabPool
};