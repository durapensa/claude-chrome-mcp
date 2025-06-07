# Claude Chrome MCP: TypeScript Reference
## TypeScript Types Documentation

## Quick Navigation
**Related Documentation:**
- [CLAUDE.md](../CLAUDE.md) - Commands and workflows
- [Architecture](ARCHITECTURE.md) - System design
- [GitHub Issues](https://github.com/durapensa/claude-chrome-mcp/issues) - Active work

**Need Help?** See [Troubleshooting](TROUBLESHOOTING.md)

## Overview

Claude Chrome MCP provides comprehensive TypeScript type definitions for all APIs, tools, and data structures. This enables type-safe development with full IDE support.

## Installation

The types are included with the main package:

```bash
npm install claude-chrome-mcp
```

## Basic Usage

```typescript
import { 
  SpawnClaudeTabParams,
  SendMessageToClaudeTabParams,
  MCPToolRequest,
  MCPToolResponse
} from 'claude-chrome-mcp/shared';

// Type-safe tool parameters
const spawnParams: SpawnClaudeTabParams = {
  url: 'https://claude.ai',
  usePool: true
};

// Type-safe tool requests
const request: MCPToolRequest = {
  name: 'spawn_claude_tab',
  arguments: spawnParams
};
```

## Available Types

### Core Types (from `types.ts`)

- `ClaudeSession` - Claude conversation session information
- `WebSocketMessage` - WebSocket communication messages
- `MCPToolRequest` - Generic MCP tool request structure
- `MCPToolResponse` - Generic MCP tool response structure
- `ChromeDebuggerCommand` - Chrome debugger protocol commands
- `TabState` - Chrome tab state information

### Tool Parameter Types (from `mcp-tool-types.ts`)

All MCP tools have corresponding parameter interfaces:

- `SpawnClaudeTabParams`
- `SendMessageToClaudeTabParams`
- `GetClaudeResponseParams`
- `BatchSendMessagesParams`
- `GetConversationMetadataParams`
- `ExportConversationTranscriptParams`
- ... and more (26 total tool parameter types)

### Response Types

Each tool has a specific response type:

- `SpawnClaudeTabResponse`
- `SendMessageResponse`
- `ClaudeResponseData`
- `BatchSendResponse`
- `ConversationMetadata`
- `TabPoolStats`
- `ConnectionHealth`
- ... and more

### Union Types

For generic tool handling:

```typescript
// Discriminated union for all tool parameters
type ToolParams = 
  | { tool: 'spawn_claude_tab'; params: SpawnClaudeTabParams }
  | { tool: 'send_message_to_claude_tab'; params: SendMessageToClaudeTabParams }
  // ... all other tools

// Discriminated union for all tool responses  
type ToolResponse =
  | { tool: 'spawn_claude_tab'; result: SpawnClaudeTabResponse }
  | { tool: 'send_message_to_claude_tab'; result: SendMessageResponse }
  // ... all other tools
```

## Type Guards

Runtime type checking utilities:

```typescript
import { isErrorResponse, isSpawnTabResponse } from 'claude-chrome-mcp/shared';

function handleResponse(response: unknown) {
  if (isErrorResponse(response)) {
    console.error('Error:', response.error);
  } else if (isSpawnTabResponse(response)) {
    console.log('Tab spawned:', response.id);
  }
}
```

## Advanced Usage

### Generic Tool Handler

```typescript
import { ToolParams, ToolResponse } from 'claude-chrome-mcp/shared';

async function callTool(params: ToolParams): Promise<ToolResponse> {
  switch (params.tool) {
    case 'spawn_claude_tab':
      const result = await spawnTab(params.params);
      return { tool: 'spawn_claude_tab', result };
    
    case 'send_message_to_claude_tab':
      const response = await sendMessage(params.params);
      return { tool: 'send_message_to_claude_tab', result: response };
    
    // Handle all other tools...
  }
}
```

### Tab Pool Integration

```typescript
import { TabPoolStats, ConfigureTabPoolParams } from 'claude-chrome-mcp/shared';

// Configure tab pool
const config: ConfigureTabPoolParams = {
  maxSize: 10,
  minSize: 3,
  idleTimeout: 300000
};

// Check pool stats
function logPoolStats(stats: TabPoolStats) {
  console.log(`Pool: ${stats.available}/${stats.total} available`);
  console.log(`Reuse rate: ${(stats.reused / stats.created * 100).toFixed(1)}%`);
}
```

### Error Handling

```typescript
import { 
  SendMessageToClaudeTabParams,
  SendMessageResponse,
  isErrorResponse 
} from 'claude-chrome-mcp/shared';

async function safeSendMessage(params: SendMessageToClaudeTabParams): Promise<void> {
  try {
    const response = await client.callTool('send_message_to_claude_tab', params);
    
    if (isErrorResponse(response)) {
      throw new Error(response.error);
    }
    
    const result = response as SendMessageResponse;
    if (!result.success) {
      throw new Error(result.error || 'Failed to send message');
    }
    
    console.log('Message sent successfully');
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
}
```

## IDE Support

With these types, you get:

- **IntelliSense/Autocomplete** - Full parameter and return type suggestions
- **Type Checking** - Compile-time error detection
- **Documentation** - Inline documentation via JSDoc comments
- **Refactoring** - Safe refactoring with type awareness

## Migration Guide

If you're migrating from JavaScript:

1. **Add TypeScript** to your project:
   ```bash
   npm install --save-dev typescript @types/node
   ```

2. **Create tsconfig.json**:
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "commonjs",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true
     }
   }
   ```

3. **Import types** in your files:
   ```typescript
   import { SpawnClaudeTabParams } from 'claude-chrome-mcp/shared';
   ```

4. **Add types** to your code:
   ```typescript
   // Before
   function spawnTab(params) { ... }
   
   // After
   function spawnTab(params: SpawnClaudeTabParams): Promise<SpawnClaudeTabResponse> { ... }
   ```

## Best Practices

1. **Use specific types** rather than `any`
2. **Enable strict mode** in tsconfig.json
3. **Use type guards** for runtime validation
4. **Leverage union types** for flexibility
5. **Document complex types** with JSDoc

## Contributing

When adding new tools or modifying APIs:

1. Update the appropriate type definition file
2. Add corresponding response types
3. Update union types if adding new tools
4. Add type guards if needed
5. Test that types compile correctly
6. Update this documentation

## Type Definition Files

- `/shared/types.ts` - Core types (existing)
- `/shared/mcp-tool-types.ts` - MCP tool specific types
- `/shared/index.ts` - Central export point

## Related Documentation

- [**Architecture**](ARCHITECTURE.md) - System design and component overview
- [**Troubleshooting**](../CLAUDE.md#troubleshooting) - Complete troubleshooting including type-related debugging
- `/tests/test-typescript-types.ts` - Type compilation tests