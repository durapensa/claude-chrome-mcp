/**
 * Claude Chrome MCP TypeScript Usage Examples
 * 
 * This file demonstrates how to use the TypeScript types in various scenarios
 */

import {
  // Core types
  ClaudeTab,
  ClaudeConversation,
  
  // Tool parameter types
  SendMessageToClaudeTabParams,
  GetClaudeResponseParams,
  BatchSendMessagesParams,
  
  // Response types
  SendMessageResponse,
  GetClaudeResponseResult,
  ConnectionHealthStatus,
  
  // Enums and constants
  MCPToolName,
  
  // Type guards
  isClaudeTab,
  isConnectionHealthStatus,
  
  // Hub types
  HubClientConfig,
  ClientInfo
} from '../index';

// Example 1: Basic tab management
async function manageClaudeTabs() {
  // Get all Claude tabs
  const tabs: ClaudeTab[] = await getClaudeTabs();
  
  // Filter active tabs with conversations
  const activeTabs = tabs.filter(tab => 
    tab.active && tab.conversationId !== null
  );
  
  console.log(`Found ${activeTabs.length} active Claude tabs with conversations`);
  
  // Create a new tab
  const newTab = await spawnClaudeTab('https://claude.ai/new');
  console.log(`Created new tab with ID: ${newTab.id}`);
}

// Example 2: Sending messages with proper error handling
async function sendMessageSafely(tabId: number, message: string): Promise<boolean> {
  const params: SendMessageToClaudeTabParams = {
    tabId,
    message,
    waitForReady: true,
    maxRetries: 3
  };
  
  try {
    const response: SendMessageResponse = await sendMessage(params);
    
    if (response.success) {
      console.log('Message sent successfully');
      if (response.retriesNeeded) {
        console.log(`Required ${response.retriesNeeded} retries`);
      }
      return true;
    } else {
      console.error(`Failed to send message: ${response.reason}`);
      return false;
    }
  } catch (error) {
    console.error('Error sending message:', error);
    return false;
  }
}

// Example 3: Getting responses with metadata
async function getResponseWithMetadata(tabId: number): Promise<string | null> {
  const params: GetClaudeResponseParams = {
    tabId,
    waitForCompletion: true,
    timeoutMs: 20000, // 20 seconds for longer responses
    includeMetadata: true
  };
  
  const result: GetClaudeResponseResult = await getResponse(params);
  
  if (result.success && result.text) {
    console.log('Response received:', result.text);
    
    if (result.metadata) {
      console.log('Response metadata:', {
        length: result.metadata.messageLength,
        complete: result.isComplete,
        indicators: result.metadata.completionIndicators
      });
    }
    
    return result.text;
  }
  
  console.error('Failed to get response:', result.reason);
  return null;
}

// Example 4: Batch operations with progress tracking
async function sendMultipleMessages(messageData: Array<{tabId: number; message: string}>) {
  const params: BatchSendMessagesParams = {
    messages: messageData,
    sequential: true // Send one at a time
  };
  
  const response = await batchSendMessages(params);
  
  // Log summary
  console.log(`Batch operation completed in ${response.summary.durationMs}ms`);
  console.log(`Success: ${response.summary.successful}/${response.summary.total}`);
  
  // Check individual results
  response.results.forEach((result, index) => {
    if (!result.success) {
      console.error(`Message ${index + 1} failed:`, result.error);
    }
  });
  
  return response.summary.failed === 0;
}

// Example 5: Type guards for runtime validation
function processUnknownData(data: unknown) {
  // Validate if data is a Claude tab
  if (isClaudeTab(data)) {
    // TypeScript now knows data is ClaudeTab
    console.log(`Tab ${data.id}: ${data.title}`);
    if (data.conversationId) {
      console.log(`Has conversation: ${data.conversationId}`);
    }
  }
  
  // Validate connection health
  if (isConnectionHealthStatus(data)) {
    // TypeScript now knows data is ConnectionHealthStatus
    if (data.health.status === 'healthy') {
      console.log('System is healthy');
    } else {
      console.log('Issues detected:', data.health.issues);
    }
  }
}

// Example 6: Hub client configuration
function createHubClient(): HubClientConfig {
  const clientInfo: ClientInfo = {
    id: 'example-client',
    name: 'TypeScript Example Client',
    type: 'mcp',
    capabilities: ['chrome_tabs', 'debugger', 'claude_automation']
  };
  
  const config: HubClientConfig = {
    serverUrl: 'ws://localhost:54321',
    clientInfo
  };
  
  return config;
}

// Example 7: Working with conversations
async function exportConversation(tabId: number) {
  // Get metadata first
  const metadata = await getConversationMetadata({
    tabId,
    includeMessages: true
  });
  
  console.log(`Conversation has ${metadata.messageCount} messages`);
  console.log('Features:', metadata.features);
  
  // Export as markdown
  const transcript = await exportTranscript({
    tabId,
    format: 'markdown'
  });
  
  console.log(`Exported ${transcript.metadata.messageCount} messages`);
  return transcript.content;
}

// Example 8: Error handling with typed errors
async function robustOperation(tabId: number) {
  try {
    const health = await getConnectionHealth();
    if (!health.health.hub.connected) {
      throw new Error('Hub not connected');
    }
    
    await sendMessage({
      tabId,
      message: 'Test message',
      waitForReady: true
    });
    
  } catch (error: any) {
    // Check error codes
    switch (error.code) {
      case 'HUB_NOT_CONNECTED':
        console.error('Hub connection lost');
        break;
      case 'TAB_NOT_FOUND':
        console.error('Claude tab not found');
        break;
      case 'DEBUGGER_ERROR':
        console.error('Chrome debugger error');
        break;
      default:
        console.error('Unknown error:', error.message);
    }
  }
}

// Example 9: Advanced element extraction
async function extractConversationContent(tabId: number) {
  const result = await extractElements({
    tabId,
    batchSize: 25,
    maxElements: 500
  });
  
  if (result.success) {
    // Group elements by type
    const byType = result.elements.reduce((acc, elem) => {
      if (!acc[elem.type]) acc[elem.type] = [];
      acc[elem.type].push(elem);
      return acc;
    }, {} as Record<string, typeof result.elements>);
    
    // Process artifacts
    if (byType.artifact) {
      console.log(`Found ${byType.artifact.length} artifacts`);
      byType.artifact.forEach(artifact => {
        console.log(`- Artifact: ${artifact.metadata?.artifactId}`);
      });
    }
    
    // Process code blocks
    if (byType.codeBlock) {
      console.log(`Found ${byType.codeBlock.length} code blocks`);
      byType.codeBlock.forEach(code => {
        console.log(`- Code (${code.metadata?.language}): ${code.content.slice(0, 50)}...`);
      });
    }
  }
}

// Example 10: Response status monitoring
async function waitForResponseCompletion(tabId: number, maxWaitMs: number = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await getResponseStatus({ tabId });
    
    if (status.isComplete) {
      console.log('Response completed!');
      return true;
    }
    
    if (status.estimatedProgress) {
      console.log(`Progress: ${Math.round(status.estimatedProgress * 100)}%`);
    }
    
    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('Timeout waiting for response completion');
  return false;
}

// Placeholder functions (would be actual implementations)
declare function getClaudeTabs(): Promise<ClaudeTab[]>;
declare function spawnClaudeTab(url: string): Promise<{id: number; url: string; title: string}>;
declare function sendMessage(params: SendMessageToClaudeTabParams): Promise<SendMessageResponse>;
declare function getResponse(params: GetClaudeResponseParams): Promise<GetClaudeResponseResult>;
declare function batchSendMessages(params: BatchSendMessagesParams): Promise<any>;
declare function getConversationMetadata(params: any): Promise<any>;
declare function exportTranscript(params: any): Promise<any>;
declare function getConnectionHealth(): Promise<ConnectionHealthStatus>;
declare function extractElements(params: any): Promise<any>;
declare function getResponseStatus(params: any): Promise<any>;