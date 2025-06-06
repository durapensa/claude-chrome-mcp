# Claude Chrome MCP TypeScript Types Documentation

This document provides a comprehensive overview of all TypeScript types available in the Claude Chrome MCP project.

## Overview

The type definitions are organized into several categories:

1. **Core Types** - Basic data structures used throughout the project
2. **MCP Tool Types** - Parameters and responses for MCP tools
3. **Hub Communication Types** - WebSocket messages and hub client types
4. **Error Types** - Error handling structures
5. **Utility Types** - Type guards and helper types

## File Structure

- `shared/types.ts` - Original core types (maintained for backward compatibility)
- `shared/api-types.ts` - Comprehensive API type definitions
- `shared/index.ts` - Central export point for all types

## Usage

### Importing Types

```typescript
// Import specific types
import { ClaudeTab, SendMessageResponse } from '@claude-chrome-mcp/shared';

// Import all types
import * as CCMTypes from '@claude-chrome-mcp/shared';

// Import from specific files
import { MCPToolName } from '@claude-chrome-mcp/shared/api-types';
```

### MCP Tool Usage Examples

#### Send Message to Claude Tab

```typescript
import { SendMessageToClaudeTabParams, SendMessageResponse } from '@claude-chrome-mcp/shared';

const params: SendMessageToClaudeTabParams = {
  tabId: 12345,
  message: "Hello, Claude!",
  waitForReady: true,
  maxRetries: 3
};

// Response will be of type SendMessageResponse
const response: SendMessageResponse = await sendMessage(params);
if (response.success) {
  console.log("Message sent successfully!");
}
```

#### Get Claude Response

```typescript
import { GetClaudeResponseParams, GetClaudeResponseResult } from '@claude-chrome-mcp/shared';

const params: GetClaudeResponseParams = {
  tabId: 12345,
  waitForCompletion: true,
  timeoutMs: 15000,
  includeMetadata: true
};

const result: GetClaudeResponseResult = await getResponse(params);
if (result.success && result.isComplete) {
  console.log("Response:", result.text);
  console.log("Metadata:", result.metadata);
}
```

#### Batch Operations

```typescript
import { BatchSendMessagesParams, BatchSendMessagesResponse } from '@claude-chrome-mcp/shared';

const params: BatchSendMessagesParams = {
  messages: [
    { tabId: 123, message: "First message" },
    { tabId: 456, message: "Second message" }
  ],
  sequential: true
};

const response: BatchSendMessagesResponse = await batchSend(params);
console.log(`Sent ${response.summary.successful} of ${response.summary.total} messages`);
```

### Type Guards

The API provides type guards for runtime type checking:

```typescript
import { isClaudeTab, isConnectionHealthStatus } from '@claude-chrome-mcp/shared';

// Check if an object is a valid ClaudeTab
if (isClaudeTab(someObject)) {
  // TypeScript now knows someObject is a ClaudeTab
  console.log(someObject.conversationId);
}

// Check connection health response
if (isConnectionHealthStatus(response)) {
  if (response.health.status === 'healthy') {
    console.log("Connection is healthy!");
  }
}
```

### Hub Client Usage

```typescript
import { HubClientConfig, ClientInfo, HubConnectionStats } from '@claude-chrome-mcp/shared';

const config: HubClientConfig = {
  serverUrl: 'ws://localhost:54321',
  clientInfo: {
    id: 'my-client',
    name: 'My MCP Client',
    type: 'mcp',
    capabilities: ['chrome_tabs', 'debugger']
  }
};

// Get connection statistics
const stats: HubConnectionStats = hubClient.getConnectionStats();
console.log(`Connection state: ${stats.state}`);
console.log(`Reconnect attempts: ${stats.reconnectAttempts}`);
```

### Error Handling

```typescript
import { MCPError, HubConnectionError, ChromeExtensionError } from '@claude-chrome-mcp/shared';

try {
  await someOperation();
} catch (error) {
  if (error.code === 'HUB_NOT_CONNECTED') {
    // Handle hub connection error
    const hubError = error as HubConnectionError;
    console.error("Hub not connected:", hubError.message);
  } else if (error.code === 'TAB_NOT_FOUND') {
    // Handle Chrome extension error
    const extError = error as ChromeExtensionError;
    console.error("Tab not found:", extError.message);
  }
}
```

## MCP Tool Reference

### Available Tools

The `MCPToolName` enum provides all available tool names:

```typescript
export enum MCPToolName {
  SpawnClaudeTab = 'spawn_claude_tab',
  GetClaudeTabs = 'get_claude_tabs',
  GetClaudeConversations = 'get_claude_conversations',
  SendMessageToClaudeTab = 'send_message_to_claude_tab',
  GetClaudeResponse = 'get_claude_response',
  BatchSendMessages = 'batch_send_messages',
  GetConversationMetadata = 'get_conversation_metadata',
  ExportConversationTranscript = 'export_conversation_transcript',
  DebugAttach = 'debug_attach',
  ExecuteScript = 'execute_script',
  GetDomElements = 'get_dom_elements',
  DebugClaudePage = 'debug_claude_page',
  DeleteClaudeConversation = 'delete_claude_conversation',
  ReloadExtension = 'reload_extension',
  StartNetworkInspection = 'start_network_inspection',
  StopNetworkInspection = 'stop_network_inspection',
  GetCapturedRequests = 'get_captured_requests',
  CloseClaudeTab = 'close_claude_tab',
  OpenClaudeConversationTab = 'open_claude_conversation_tab',
  ExtractConversationElements = 'extract_conversation_elements',
  GetClaudeResponseStatus = 'get_claude_response_status',
  BatchGetResponses = 'batch_get_responses',
  GetConnectionHealth = 'system_health'
}
```

### Tool Categories

#### Tab Management
- `spawn_claude_tab` - Create a new Claude.ai tab
- `get_claude_tabs` - List all open Claude tabs
- `close_claude_tab` - Close a specific tab
- `open_claude_conversation_tab` - Open a specific conversation

#### Messaging
- `send_message_to_claude_tab` - Send a message to Claude
- `get_claude_response` - Get Claude's response
- `batch_send_messages` - Send multiple messages
- `batch_get_responses` - Get responses from multiple tabs

#### Conversation Management
- `get_claude_conversations` - List recent conversations
- `get_conversation_metadata` - Get metadata about a conversation
- `export_conversation_transcript` - Export conversation as markdown/JSON
- `delete_claude_conversation` - Delete a conversation
- `extract_conversation_elements` - Extract artifacts, code blocks, etc.

#### Debugging & Advanced
- `debug_attach` - Attach Chrome debugger
- `execute_script` - Execute JavaScript in a tab
- `get_dom_elements` - Query DOM elements
- `debug_claude_page` - Get page debug information
- `start_network_inspection` - Monitor network requests
- `stop_network_inspection` - Stop monitoring
- `get_captured_requests` - Get captured requests

#### System
- `reload_extension` - Reload the Chrome extension
- `system_health` - Check system health

## Type Union Examples

### Working with Union Types

```typescript
// MCPToolParams is a union of all tool parameter types
function callTool(name: MCPToolName, params: MCPToolParams) {
  switch (name) {
    case MCPToolName.SendMessageToClaudeTab:
      // TypeScript narrows params to SendMessageToClaudeTabParams
      const sendParams = params as SendMessageToClaudeTabParams;
      return sendMessage(sendParams);
    
    case MCPToolName.GetClaudeTabs:
      // No parameters needed for this tool
      return getTabs();
    
    // ... handle other tools
  }
}

// MCPToolResponse is a union of all response types
function handleResponse(toolName: MCPToolName, response: MCPToolResponse) {
  switch (toolName) {
    case MCPToolName.GetClaudeTabs:
      // TypeScript knows this is ClaudeTab[]
      const tabs = response as ClaudeTab[];
      console.log(`Found ${tabs.length} Claude tabs`);
      break;
    
    case MCPToolName.SendMessageToClaudeTab:
      // TypeScript knows this is SendMessageResponse
      const sendResult = response as SendMessageResponse;
      if (sendResult.success) {
        console.log("Message sent!");
      }
      break;
    
    // ... handle other responses
  }
}
```

## Best Practices

1. **Always use type imports** - Import only the types you need to keep bundle sizes small
2. **Use type guards** - Validate unknown data at runtime with provided type guards
3. **Handle all response cases** - Check `success` fields and handle error cases
4. **Set appropriate timeouts** - Use realistic timeout values for long operations
5. **Use metadata when debugging** - Enable `includeMetadata` for detailed information

## Migration Guide

If you're migrating from untyped JavaScript:

1. Install TypeScript: `npm install -D typescript @types/node`
2. Add the shared types: `npm install @claude-chrome-mcp/shared`
3. Update your imports to use typed versions
4. Add type annotations to your function parameters and returns
5. Use type guards for runtime validation

## Contributing

When adding new MCP tools or modifying existing ones:

1. Update the parameter interface in `api-types.ts`
2. Update the response interface
3. Add the tool to `MCPToolName` enum
4. Update the union types (`MCPToolParams` and `MCPToolResponse`)
5. Add a type guard if the response has a unique structure
6. Update this documentation

## Type Safety Tips

1. **Enable strict mode** in your `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "strictNullChecks": true
     }
   }
   ```

2. **Use const assertions** for literal types:
   ```typescript
   const params = {
     tabId: 123,
     format: 'markdown' as const  // Ensures type is 'markdown', not string
   } satisfies ExportConversationTranscriptParams;
   ```

3. **Leverage discriminated unions**:
   ```typescript
   if (response.type === 'response') {
     // TypeScript knows this is a success response
   } else if (response.type === 'error') {
     // TypeScript knows this is an error response
   }
   ```