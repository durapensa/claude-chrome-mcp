/**
 * Claude Chrome MCP API Type Definitions
 * 
 * This file contains all TypeScript type definitions for the Claude Chrome MCP project,
 * including MCP tools, hub client APIs, WebSocket messages, and response structures.
 */

// ============================================================================
// Core Types (from existing types.ts)
// ============================================================================

export interface ClaudeSession {
  id: string;
  tabId: number;
  url: string;
  title: string;
  isActive: boolean;
  lastActivity: Date;
}

export interface WebSocketMessage {
  type: 'debugger_command' | 'debugger_response' | 'session_update' | 'keepalive' | 'error';
  tabId?: number;
  sessionId?: string;
  command?: string;
  params?: any;
  result?: any;
  error?: string;
  timestamp: number;
}

export interface MCPToolRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPContentResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface ChromeDebuggerCommand {
  method: string;
  params?: Record<string, any>;
}

export interface TabState {
  id: number;
  url: string;
  title: string;
  isClaudeTab: boolean;
  debuggerAttached: boolean;
  sessionInfo?: ClaudeSession;
}

// ============================================================================
// MCP Tool Parameters
// ============================================================================

export interface SpawnClaudeTabParams {
  url?: string; // defaults to 'https://claude.ai'
}

export interface GetClaudeTabsParams {
  // No parameters
}

export interface GetClaudeConversationsParams {
  // No parameters
}

export interface SendMessageToClaudeTabParams {
  tabId: number;
  message: string;
  waitForReady?: boolean; // defaults to true
  maxRetries?: number; // defaults to 3, min 1, max 5
}

export interface GetClaudeResponseParams {
  tabId: number;
  waitForCompletion?: boolean; // defaults to true
  timeoutMs?: number; // defaults to 10000
  includeMetadata?: boolean; // defaults to false
}

export interface BatchSendMessagesParams {
  messages: Array<{
    tabId: number;
    message: string;
  }>;
  sequential?: boolean; // defaults to false
}

export interface GetConversationMetadataParams {
  tabId: number;
  includeMessages?: boolean; // defaults to false
}

export interface ExportConversationTranscriptParams {
  tabId: number;
  format?: 'markdown' | 'json'; // defaults to 'markdown'
}

export interface DebugAttachParams {
  tabId: number;
}

export interface ExecuteScriptParams {
  tabId: number;
  script: string;
}

export interface GetDomElementsParams {
  tabId: number;
  selector: string;
}

export interface DebugClaudePageParams {
  tabId: number;
}

export interface DeleteClaudeConversationParams {
  tabId: number;
  conversationId?: string; // Optional, defaults to current conversation
}

export interface ReloadExtensionParams {
  // No parameters
}

export interface StartNetworkInspectionParams {
  tabId: number;
}

export interface StopNetworkInspectionParams {
  tabId: number;
}

export interface GetCapturedRequestsParams {
  tabId: number;
}

export interface CloseClaudeTabParams {
  tabId: number;
  force?: boolean; // defaults to false
}

export interface OpenClaudeConversationTabParams {
  conversationId: string; // UUID format
  activate?: boolean; // defaults to true
  waitForLoad?: boolean; // defaults to true
  loadTimeoutMs?: number; // defaults to 10000
}

export interface ExtractConversationElementsParams {
  tabId: number;
  batchSize?: number; // defaults to 50
  maxElements?: number; // defaults to 1000
}

export interface GetClaudeResponseStatusParams {
  tabId: number;
}

export interface BatchGetResponsesParams {
  tabIds: number[];
  timeoutMs?: number; // defaults to 30000
  waitForAll?: boolean; // defaults to true
  pollIntervalMs?: number; // defaults to 1000
}

export interface GetConnectionHealthParams {
  // No parameters
}

export interface ForwardResponseToClaudeTabParams {
  sourceTabId: number;
  targetTabId: number;
  template?: string;
  prefixText?: string;
  suffixText?: string;
  extractPattern?: string;
  waitForCompletion?: boolean; // defaults to true
  waitForReady?: boolean; // defaults to true
  timeoutMs?: number; // defaults to 30000
  maxRetries?: number; // defaults to 3
}

// ============================================================================
// MCP Tool Responses
// ============================================================================

export interface ClaudeTab {
  id: number;
  url: string;
  title: string;
  active: boolean;
  debuggerAttached: boolean;
  conversationId?: string | null;
}

export interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  is_starred: boolean;
  tabId?: number | null; // Present if conversation is open in a tab
}

export interface SpawnClaudeTabResponse {
  id: number;
  url: string;
  title: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageSent?: boolean;
  reason?: string;
  retriesNeeded?: number;
  retriesAttempted?: number;
}

export interface ClaudeResponseMetadata {
  completionIndicators: string[];
  messageLength: number;
  hasStopButton: boolean;
  hasDropdownButton: boolean;
}

export interface GetClaudeResponseResult {
  success: boolean;
  text?: string;
  isUser?: boolean;
  isAssistant?: boolean;
  timestamp?: number;
  totalMessages?: number;
  isComplete?: boolean;
  reason?: string;
  metadata?: ClaudeResponseMetadata;
}

export interface BatchSendResult {
  tabId: number;
  success: boolean;
  result?: SendMessageResponse;
  error?: string;
  timestamp: number;
}

export interface BatchSendMessagesResponse {
  success: boolean;
  summary: {
    total: number;
    successful: number;
    failed: number;
    sequential: boolean;
    durationMs: number;
  };
  results: BatchSendResult[];
}

export interface ForwardResponseResult {
  operationId: string;
  status: 'started';
  type: 'forward_response';
  timestamp: number;
}

export interface ConversationMessage {
  text: string;
  role: 'user' | 'assistant';
  timestamp?: number;
}

export interface ConversationMetadata {
  tabId: number;
  url: string;
  title: string;
  conversationId: string | null;
  messageCount: number;
  messages?: ConversationMessage[];
  features: {
    hasArtifacts: boolean;
    hasCodeBlocks: boolean;
    hasImages: boolean;
    hasTools: boolean;
  };
  lastUpdated: number;
}

export interface ExportedTranscript {
  format: 'markdown' | 'json';
  content: string;
  metadata: {
    exportedAt: number;
    messageCount: number;
    conversationId: string | null;
  };
}

export interface DebugAttachResponse {
  attached: boolean;
  tabId: number;
}

export interface ExecuteScriptResult {
  result: {
    type: string;
    value: any;
  };
}

export interface DomElement {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  attributes?: Record<string, string>;
}

export interface DebugPageInfo {
  isClaudePage: boolean;
  isReady: boolean;
  hasConversation: boolean;
  conversationId?: string;
  messageCount?: number;
  isStreaming?: boolean;
  debugInfo: {
    url: string;
    title: string;
    readyState: string;
    hasInputField: boolean;
    hasSendButton: boolean;
  };
}

export interface DeleteConversationResponse {
  success: boolean;
  conversationId: string;
  message?: string;
  error?: string;
}

export interface ReloadExtensionResponse {
  success: boolean;
  message: string;
}

export interface NetworkInspectionResponse {
  success: boolean;
  tabId: number;
  message?: string;
}

export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  timestamp: number;
  headers?: Record<string, string>;
  postData?: string;
  response?: {
    status: number;
    statusText: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

export interface CloseTabResponse {
  success: boolean;
  tabId: number;
  message?: string;
}

export interface OpenConversationTabResponse {
  success: boolean;
  tabId: number;
  conversationId: string;
  url: string;
  loadTime?: number;
}

export interface ConversationElement {
  type: 'artifact' | 'codeBlock' | 'image' | 'tool' | 'text';
  content: string;
  metadata?: {
    language?: string;
    filename?: string;
    toolName?: string;
    artifactId?: string;
  };
  position: number;
}

export interface ExtractElementsResponse {
  success: boolean;
  elements: ConversationElement[];
  summary: {
    totalElements: number;
    byType: Record<string, number>;
    extractionTime: number;
  };
}

export interface ResponseStatus {
  isGenerating: boolean;
  isComplete: boolean;
  messageLength?: number;
  estimatedProgress?: number;
  indicators: {
    hasStopButton: boolean;
    hasStreamingIndicators: boolean;
    lastUpdateTime: number;
  };
}

export interface BatchResponseResult {
  tabId: number;
  status: 'pending' | 'complete' | 'error' | 'timeout';
  response?: GetClaudeResponseResult;
  error?: string;
  completedAt?: number;
}

export interface BatchGetResponsesResult {
  success: boolean;
  summary: {
    total: number;
    completed: number;
    pending: number;
    errors: number;
    timeouts: number;
    totalDuration: number;
  };
  results: BatchResponseResult[];
}

export interface ConnectionHealthStatus {
  success: boolean;
  health: {
    timestamp: number;
    status: 'healthy' | 'unhealthy';
    issues: string[];
    hub: {
      connected: boolean;
      readyState: number | null;
      url: string | null;
      reconnectAttempts: number;
    };
    clients: {
      total: number;
      list: Array<{
        id: string;
        name: string;
        type: string;
        connectedAt: number;
        lastActivity: number;
      }>;
    };
    debugger: {
      sessionsActive: number;
      attachedTabs: number[];
    };
    chrome: {
      runtime: {
        id: string;
        manifestVersion: string;
      };
    };
    alarms: Array<{
      name: string;
      scheduledTime: number;
      periodInMinutes?: number;
    } | { error: string }>;
    activity: {
      lastKeepalive: number | null;
      timeSinceLastKeepalive: number | null;
      lastHubMessage: number | null;
      timeSinceLastHubMessage: number | null;
    };
  };
}

// ============================================================================
// Hub Client API Types
// ============================================================================

export interface HubClientConfig {
  serverUrl?: string; // defaults to 'ws://localhost:54321'
  clientInfo?: ClientInfo;
}

export interface ClientInfo {
  id?: string;
  name?: string;
  type?: 'mcp' | 'cli' | 'claude-desktop' | 'claude-code' | 'vscode' | 'cursor' | 'generic';
  capabilities?: string[];
}

export interface HubConnectionStats {
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'shutting_down';
  reconnectAttempts: number;
  lastSuccessfulConnection: number | null;
  pendingRequests: number;
  isHubOwner: boolean;
  connectionHistory: Array<{
    timestamp: number;
    event: string;
    attempt?: number;
    code?: number;
    reason?: string;
    error?: string;
    delay?: number;
  }>;
}

// ============================================================================
// WebSocket Hub Messages
// ============================================================================

export interface HubMessage {
  type: string;
  timestamp: number;
  [key: string]: any;
}

export interface ChromeExtensionRegisterMessage extends HubMessage {
  type: 'chrome_extension_register';
  extensionId: string;
}

export interface MCPClientRegisterMessage extends HubMessage {
  type: 'mcp_client_register';
  clientInfo: ClientInfo;
}

export interface HubRequestMessage extends HubMessage {
  type: string; // Tool name
  requestId: string;
  params?: any;
  sourceClientId?: string;
  sourceClientName?: string;
  hubMessageId?: number;
}

export interface HubResponseMessage extends HubMessage {
  type: 'response' | 'error';
  requestId: string;
  targetClientId: string;
  result?: any;
  error?: string;
}

export interface HubWelcomeMessage extends HubMessage {
  type: 'welcome';
  clientId: string;
  serverInfo: {
    name: string;
    version: string;
    port: number;
    startTime: number;
  };
}

export interface HubRegistrationConfirmedMessage extends HubMessage {
  type: 'registration_confirmed';
  clientId?: string;
  role: 'chrome_extension' | 'mcp_client';
  hubInfo: {
    name: string;
    version: string;
    port: number;
    startTime: number;
    clientCount: number;
    extensionConnected: boolean;
  };
}

export interface HubClientListUpdateMessage extends HubMessage {
  type: 'client_list_update';
  clients: Array<{
    id: string;
    name: string;
    type: string;
    capabilities: string[];
    connected: boolean;
    registeredAt: number;
    requestCount: number;
    lastActivity: number;
  }>;
}

export interface HubShutdownMessage extends HubMessage {
  type: 'hub_shutdown';
  reason: string;
}

export interface HubKeepaliveMessage extends HubMessage {
  type: 'keepalive' | 'keepalive_response';
}

// ============================================================================
// Error Types
// ============================================================================

export interface MCPError extends Error {
  code?: string;
  details?: any;
}

export interface HubConnectionError extends MCPError {
  code: 'HUB_NOT_CONNECTED' | 'HUB_TIMEOUT' | 'HUB_CLOSED';
}

export interface ChromeExtensionError extends MCPError {
  code: 'EXTENSION_NOT_CONNECTED' | 'TAB_NOT_FOUND' | 'DEBUGGER_ERROR';
}

// ============================================================================
// MCP Tool Names Enum
// ============================================================================

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
  GetConnectionHealth = 'get_connection_health'
}

// ============================================================================
// Type Guards
// ============================================================================

export function isClaudeTab(obj: any): obj is ClaudeTab {
  return obj && 
    typeof obj.id === 'number' &&
    typeof obj.url === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.active === 'boolean' &&
    typeof obj.debuggerAttached === 'boolean';
}

export function isClaudeConversation(obj: any): obj is ClaudeConversation {
  return obj &&
    typeof obj.uuid === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.created_at === 'string' &&
    typeof obj.updated_at === 'string' &&
    typeof obj.is_starred === 'boolean';
}

export function isSendMessageResponse(obj: any): obj is SendMessageResponse {
  return obj &&
    typeof obj.success === 'boolean' &&
    (obj.messageSent === undefined || typeof obj.messageSent === 'boolean') &&
    (obj.reason === undefined || typeof obj.reason === 'string');
}

export function isGetClaudeResponseResult(obj: any): obj is GetClaudeResponseResult {
  return obj &&
    typeof obj.success === 'boolean' &&
    (obj.text === undefined || typeof obj.text === 'string') &&
    (obj.isComplete === undefined || typeof obj.isComplete === 'boolean');
}

export function isConnectionHealthStatus(obj: any): obj is ConnectionHealthStatus {
  return obj &&
    typeof obj.success === 'boolean' &&
    obj.health &&
    typeof obj.health.timestamp === 'number' &&
    typeof obj.health.status === 'string';
}

// ============================================================================
// Utility Types
// ============================================================================

export type MCPToolParams = 
  | SpawnClaudeTabParams
  | GetClaudeTabsParams
  | GetClaudeConversationsParams
  | SendMessageToClaudeTabParams
  | GetClaudeResponseParams
  | BatchSendMessagesParams
  | GetConversationMetadataParams
  | ExportConversationTranscriptParams
  | DebugAttachParams
  | ExecuteScriptParams
  | GetDomElementsParams
  | DebugClaudePageParams
  | DeleteClaudeConversationParams
  | ReloadExtensionParams
  | StartNetworkInspectionParams
  | StopNetworkInspectionParams
  | GetCapturedRequestsParams
  | CloseClaudeTabParams
  | OpenClaudeConversationTabParams
  | ExtractConversationElementsParams
  | GetClaudeResponseStatusParams
  | BatchGetResponsesParams
  | GetConnectionHealthParams;

export type MCPToolResponse = 
  | ClaudeTab[]
  | ClaudeConversation[]
  | SpawnClaudeTabResponse
  | SendMessageResponse
  | GetClaudeResponseResult
  | BatchSendMessagesResponse
  | ConversationMetadata
  | ExportedTranscript
  | DebugAttachResponse
  | ExecuteScriptResult
  | DomElement[]
  | DebugPageInfo
  | DeleteConversationResponse
  | ReloadExtensionResponse
  | NetworkInspectionResponse
  | NetworkRequest[]
  | CloseTabResponse
  | OpenConversationTabResponse
  | ExtractElementsResponse
  | ResponseStatus
  | BatchGetResponsesResult
  | ConnectionHealthStatus;