/**
 * Test TypeScript Types Compilation
 * 
 * This file tests that our TypeScript types compile correctly
 */

import { 
  // From types.ts
  MCPToolRequest,
  MCPToolResponse,
  WebSocketMessage,
  ClaudeSession,
  TabState,
  
  // From mcp-tool-types.ts
  SpawnClaudeTabParams,
  SendMessageToClaudeTabParams,
  BatchSendMessagesParams,
  GetClaudeResponseParams,
  TabPoolStats,
  ConnectionHealth,
  ToolParams,
  ToolResponse,
  isErrorResponse,
  isSpawnTabResponse
} from '../shared';

// Test 1: Tool parameter types
const spawnParams: SpawnClaudeTabParams = {
  url: 'https://claude.ai',
  usePool: true
};

const sendMessageParams: SendMessageToClaudeTabParams = {
  tabId: 123,
  message: 'Hello Claude!',
  waitForReady: true,
  maxRetries: 3
};

// Test 2: MCP Tool Request/Response (existing types)
const toolRequest: MCPToolRequest = {
  name: 'spawn_claude_tab',
  arguments: spawnParams
};

const toolResponse: MCPToolResponse = {
  content: [{
    type: 'text',
    text: JSON.stringify({ success: true, id: 123 })
  }]
};

// Test 3: Union types
const anyToolParams: ToolParams = {
  tool: 'spawn_claude_tab',
  params: spawnParams
};

const anyToolResponse: ToolResponse = {
  tool: 'get_tab_pool_stats',
  result: {
    enabled: true,
    created: 10,
    reused: 25,
    destroyed: 0,
    timeouts: 0,
    errors: 0,
    queueWaits: 0,
    averageWaitTime: 0,
    available: 3,
    busy: 2,
    warming: 0,
    waiting: 0,
    total: 5,
    config: {
      minSize: 2,
      maxSize: 5,
      idleTimeout: 300000,
      warmupDelay: 5000
    },
    tabs: []
  }
};

// Test 4: Type guards
function handleResponse(response: unknown) {
  if (isErrorResponse(response)) {
    console.error('Error:', response.error);
  } else if (isSpawnTabResponse(response)) {
    console.log('Tab spawned:', response.id);
  }
}

// Test 5: WebSocket messages (existing type)
const wsMessage: WebSocketMessage = {
  type: 'error',
  error: 'Connection failed',
  timestamp: Date.now()
};

// Test 6: Complex types
const batchParams: BatchSendMessagesParams = {
  messages: [
    { tabId: 1, message: 'First message' },
    { tabId: 2, message: 'Second message' }
  ],
  sequential: true
};

// Test 7: Optional parameters
const responseParams: GetClaudeResponseParams = {
  tabId: 456,
  // Optional parameters should work
  waitForCompletion: false,
  timeoutMs: 30000,
  includeMetadata: true
};

// Test 8: Health check response
const healthCheck: ConnectionHealth = {
  success: true,
  health: {
    timestamp: Date.now(),
    hub: {
      connected: true,
      readyState: 1,
      url: 'ws://localhost:54321',
      reconnectAttempts: 0
    },
    clients: {
      total: 1,
      list: [{
        id: 'test-client',
        name: 'Test Client',
        type: 'test',
        lastActivity: Date.now()
      }]
    },
    status: 'healthy',
    issues: []
  }
};

// Test 9: Tab state (existing type)
const tabState: TabState = {
  id: 123,
  url: 'https://claude.ai',
  title: 'Claude',
  isClaudeTab: true,
  debuggerAttached: false
};

console.log('✅ TypeScript types compile successfully!');

// Export something to make this a module
export { spawnParams };