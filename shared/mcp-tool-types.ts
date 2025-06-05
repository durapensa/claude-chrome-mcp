/**
 * MCP Tool Type Definitions for Claude Chrome MCP
 * 
 * This file contains TypeScript types for all MCP tool parameters and responses.
 * It extends the basic types defined in types.ts with specific tool interfaces.
 */

// ============================================================================
// Tool Parameter Types
// ============================================================================

export interface SpawnClaudeDotAiTabParams {
  url?: string;
  usePool?: boolean;
}

export interface GetClaudeDotAiTabsParams {
  // No parameters
}

export interface GetClaudeConversationsParams {
  // No parameters
}

export interface SendMessageToClaudeDotAiTabParams {
  tabId: number;
  message: string;
  waitForReady?: boolean;
  maxRetries?: number;
}

export interface GetClaudeDotAiResponseParams {
  tabId: number;
  waitForCompletion?: boolean;
  timeoutMs?: number;
  includeMetadata?: boolean;
}

export interface BatchSendMessagesParams {
  messages: Array<{
    tabId: number;
    message: string;
  }>;
  sequential?: boolean;
}

export interface GetConversationMetadataParams {
  tabId: number;
  includeMessages?: boolean;
}

export interface ExportConversationTranscriptParams {
  tabId: number;
  format?: 'markdown' | 'json';
}

export interface DebugAttachParams {
  tabId: number;
}

export interface DebugDetachParams {
  tabId: number;
}

export interface DebugStatusParams {
  tabId?: number;
}

export interface ExecuteScriptParams {
  tabId: number;
  script: string;
}

export interface GetDomElementsParams {
  tabId: number;
  selector: string;
}

export interface DebugClaudeDotAiPageParams {
  tabId: number;
}

export interface DeleteClaudeConversationParams {
  tabId: number;
  conversationId?: string;
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

export interface CloseClaudeDotAiTabParams {
  tabId: number;
  force?: boolean;
}

export interface OpenClaudeDotAiConversationTabParams {
  conversationId: string;
  activate?: boolean;
  waitForLoad?: boolean;
  loadTimeoutMs?: number;
}

export interface ExtractConversationElementsParams {
  tabId: number;
  maxElements?: number;
  batchSize?: number;
}

export interface GetClaudeDotAiResponseStatusParams {
  tabId: number;
}

export interface BatchGetResponsesParams {
  tabIds: number[];
  timeoutMs?: number;        // Reduced default timeout for immediate fetch
  checkReadiness?: boolean;  // Optional readiness verification
}

export interface GetConnectionHealthParams {
  // No parameters
}

export interface SystemWaitOperationParams {
  operationId: string;
  timeoutMs?: number;
}

export interface TabForwardResponseParams {
  sourceTabId: number;
  targetTabId: number;
  transformTemplate?: string;
}

export interface TabBatchOperationsParams {
  operation: 'send_messages' | 'get_responses' | 'send_and_get';
  messages?: Array<{
    tabId: number;
    message: string;
  }>;
  tabIds?: number[];
  sequential?: boolean;
  delayMs?: number;
  maxConcurrent?: number;
  timeoutMs?: number;
  waitForAll?: boolean;
  pollIntervalMs?: number;
}

export interface ApiSearchConversationsParams {
  titleSearch?: string;
  titleRegex?: string;
  createdAfter?: string;
  createdBefore?: string;
  minMessages?: number;
  maxMessages?: number;
  openOnly?: boolean;
  limit?: number;
}

export interface ApiGetConversationUrlParams {
  conversationId: string;
}

export interface ApiDeleteConversationsParams {
  conversationIds: string[];
  batchSize?: number;
  delayMs?: number;
}

// Tab Pool specific parameters
export interface GetTabPoolStatsParams {
  // No parameters
}

export interface ReleaseTabToPoolParams {
  tabId: number;
}

export interface ConfigureTabPoolParams {
  maxSize?: number;
  minSize?: number;
  idleTimeout?: number;
}

// ============================================================================
// Response Types
// ============================================================================

export interface SpawnClaudeDotAiTabResponse {
  success: boolean;
  id: number;
  source?: 'pool' | 'fresh';
  message: string;
  poolStats?: TabPoolStats;
  poolError?: string;
}

export interface ClaudeDotAiTab {
  id: number;
  url: string;
  title: string;
  active: boolean;
  debuggerAttached: boolean;
  conversationId: string | null;
}

export interface ClaudeConversation {
  uuid: string;
  name: string;
  model: string;
  updated_at: string;
  isOpen?: boolean;
  tabId?: number;
}

export interface SendMessageResponse {
  success: boolean;
  message?: string;
  retryCount?: number;
  error?: string;
}

export interface ClaudeResponseData {
  response: string;
  isComplete: boolean;
  metadata?: {
    startTime: number;
    endTime?: number;
    duration?: number;
    messageId?: string;
    model?: string;
    toolsUsed?: string[];
  };
}

export interface BatchSendResponse {
  results: Array<{
    tabId: number;
    success: boolean;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface ConversationMetadata {
  tabId: number;
  conversationId: string | null;
  messageCount: number;
  features: {
    hasArtifacts: boolean;
    hasCodeBlocks: boolean;
    hasImages: boolean;
    hasFiles: boolean;
  };
  isActive: boolean;
  error: string | null;
  messages?: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
  }>;
}

export interface ConversationTranscript {
  metadata: {
    conversationId: string;
    title: string;
    exportDate: string;
    messageCount: number;
  };
  messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
  artifacts?: Array<{
    id: string;
    type: string;
    title: string;
    content: string;
  }>;
}

export interface ConversationSearchCriteria {
  titleSearch?: string;
  titleRegex?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  minMessageCount?: number;
  maxMessageCount?: number;
  isOpen?: boolean;
  sortBy?: 'created_at' | 'updated_at' | 'title' | 'message_count';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface ConversationSearchResult {
  success: boolean;
  conversations: Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    tabId: number | null;
    isOpen: boolean;
  }>;
  search_metadata: {
    total_found: number;
    returned: number;
    filters_applied: number;
    search_criteria: ConversationSearchCriteria;
  };
}

export interface BulkDeleteOptions {
  conversationIds?: string[];
  filterCriteria?: ConversationSearchCriteria;
  dryRun?: boolean;
  batchSize?: number;
  delayBetweenBatches?: number;
  skipOpenConversations?: boolean;
}

export interface BulkDeleteResult {
  success: boolean;
  deleted: number;
  errors: string[];
  total_processed: number;
  deletion_summary: {
    successful: number;
    failed: number;
    success_rate: string;
  };
  deleted_conversations: Array<{
    id: string;
    title: string;
  }>;
  message: string;
}

export interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
}

export interface ConversationElement {
  type: 'artifact' | 'code' | 'tool_use' | 'image' | 'file';
  content: string;
  metadata?: Record<string, any>;
}

export interface ResponseStatus {
  tabId: number;
  isGenerating: boolean;
  isComplete: boolean;
  error: string | null;
  responseLength: number;
  startTime?: number;
  currentTime: number;
  estimatedCompletion?: number;
  indicators: {
    thinkingActive: boolean;
    typingIndicator: boolean;
    streamingContent: boolean;
  };
}

export interface BatchResponseResult {
  [tabId: number]: {
    response?: string;
    error?: string;
    status: 'pending' | 'complete' | 'error';
    timestamp: number;
  };
}

export interface ConnectionHealth {
  success: boolean;
  health?: {
    timestamp: number;
    hub: {
      connected: boolean;
      readyState: number;
      url: string;
      reconnectAttempts: number;
    };
    clients: {
      total: number;
      list: Array<{
        id: string;
        name: string;
        type: string;
        lastActivity: number;
      }>;
    };
    debugger?: {
      sessionsActive: number;
      attachedTabs: number[];
    };
    chrome?: {
      runtime: {
        id: string;
        manifestVersion: string;
      };
    };
    alarms?: Array<{
      name: string;
      scheduledTime: number;
      periodInMinutes?: number;
    }>;
    activity?: {
      lastKeepalive: number;
      timeSinceLastKeepalive: number;
      lastHubMessage: number;
      timeSinceLastHubMessage: number;
    };
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
  };
}

export interface TabPoolStats {
  enabled: boolean;
  created: number;
  reused: number;
  destroyed: number;
  timeouts: number;
  errors: number;
  queueWaits: number;
  averageWaitTime: number;
  available: number;
  busy: number;
  warming: number;
  waiting: number;
  total: number;
  config: {
    minSize: number;
    maxSize: number;
    idleTimeout: number;
    warmupDelay: number;
  };
  tabs: Array<{
    id: number;
    age: number;
    useCount: number;
    idleTime: number;
    errors: number;
  }>;
}

export interface TabBatchOperationsResponse {
  sendResult?: BatchSendResponse;
  getResult?: BatchResponseResult;
  success?: boolean;
  error?: string;
}

export interface ApiSearchConversationsResponse {
  success: boolean;
  conversations: Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    tabId: number | null;
    isOpen: boolean;
  }>;
  search_metadata: {
    total_found: number;
    returned: number;
    filters_applied: number;
    search_criteria: ApiSearchConversationsParams;
  };
}

export interface ApiGetConversationUrlResponse {
  success: boolean;
  conversationId: string;
  url: string;
}

export interface ApiDeleteConversationsResponse {
  success: boolean;
  deleted: number;
  errors: string[];
  total_processed: number;
  deletion_summary: {
    successful: number;
    failed: number;
    success_rate: string;
  };
  deleted_conversations: Array<{
    id: string;
    title: string;
  }>;
  message: string;
}

// ============================================================================
// Union Types for Generic Handling
// ============================================================================

export type ToolParams = 
  // LEGACY TOOLS (backward compatibility)
  | { tool: 'spawn_claude_dot_ai_tab'; params: SpawnClaudeDotAiTabParams }
  | { tool: 'get_claude_dot_ai_tabs'; params: GetClaudeDotAiTabsParams }
  | { tool: 'get_claude_conversations'; params: GetClaudeConversationsParams }
  | { tool: 'send_message_to_claude_dot_ai_tab'; params: SendMessageToClaudeDotAiTabParams }
  | { tool: 'get_claude_dot_ai_response'; params: GetClaudeDotAiResponseParams }
  | { tool: 'batch_send_messages'; params: BatchSendMessagesParams }
  | { tool: 'get_conversation_metadata'; params: GetConversationMetadataParams }
  | { tool: 'export_conversation_transcript'; params: ExportConversationTranscriptParams }
  | { tool: 'debug_attach'; params: DebugAttachParams }
  | { tool: 'execute_script'; params: ExecuteScriptParams }
  | { tool: 'get_dom_elements'; params: GetDomElementsParams }
  | { tool: 'debug_claude_dot_ai_page'; params: DebugClaudeDotAiPageParams }
  | { tool: 'delete_claude_conversation'; params: DeleteClaudeConversationParams }
  | { tool: 'reload_extension'; params: ReloadExtensionParams }
  | { tool: 'start_network_inspection'; params: StartNetworkInspectionParams }
  | { tool: 'stop_network_inspection'; params: StopNetworkInspectionParams }
  | { tool: 'get_captured_requests'; params: GetCapturedRequestsParams }
  | { tool: 'close_claude_dot_ai_tab'; params: CloseClaudeDotAiTabParams }
  | { tool: 'open_claude_dot_ai_conversation_tab'; params: OpenClaudeDotAiConversationTabParams }
  | { tool: 'extract_conversation_elements'; params: ExtractConversationElementsParams }
  | { tool: 'get_claude_dot_ai_response_status'; params: GetClaudeDotAiResponseStatusParams }
  | { tool: 'batch_get_responses'; params: BatchGetResponsesParams }
  | { tool: 'get_connection_health'; params: GetConnectionHealthParams }
  | { tool: 'get_tab_pool_stats'; params: GetTabPoolStatsParams }
  | { tool: 'release_tab_to_pool'; params: ReleaseTabToPoolParams }
  | { tool: 'configure_tab_pool'; params: ConfigureTabPoolParams }
  // NEW REORGANIZED TOOLS (pure domain separation)
  // System tools
  | { tool: 'system_health'; params: GetConnectionHealthParams }
  | { tool: 'system_wait_operation'; params: SystemWaitOperationParams }
  // Chrome tools  
  | { tool: 'chrome_reload_extension'; params: ReloadExtensionParams }
  | { tool: 'chrome_debug_attach'; params: DebugAttachParams }
  | { tool: 'chrome_debug_detach'; params: DebugDetachParams }
  | { tool: 'chrome_debug_status'; params: DebugStatusParams }
  | { tool: 'chrome_execute_script'; params: ExecuteScriptParams }
  | { tool: 'chrome_get_dom_elements'; params: GetDomElementsParams }
  | { tool: 'chrome_start_network_monitoring'; params: StartNetworkInspectionParams }
  | { tool: 'chrome_stop_network_monitoring'; params: StopNetworkInspectionParams }
  | { tool: 'chrome_get_network_requests'; params: GetCapturedRequestsParams }
  // Tab tools
  | { tool: 'tab_create'; params: SpawnClaudeDotAiTabParams }
  | { tool: 'tab_list'; params: GetClaudeDotAiTabsParams }
  | { tool: 'tab_close'; params: CloseClaudeDotAiTabParams }
  | { tool: 'tab_send_message'; params: SendMessageToClaudeDotAiTabParams }
  | { tool: 'tab_get_response'; params: GetClaudeDotAiResponseParams }
  | { tool: 'tab_get_response_status'; params: GetClaudeDotAiResponseStatusParams }
  | { tool: 'tab_forward_response'; params: TabForwardResponseParams }
  | { tool: 'tab_extract_elements'; params: ExtractConversationElementsParams }
  | { tool: 'tab_export_conversation'; params: ExportConversationTranscriptParams }
  | { tool: 'tab_debug_page'; params: DebugClaudeDotAiPageParams }
  | { tool: 'tab_batch_operations'; params: TabBatchOperationsParams }
  // API tools
  | { tool: 'api_list_conversations'; params: GetClaudeConversationsParams }
  | { tool: 'api_search_conversations'; params: ApiSearchConversationsParams }
  | { tool: 'api_get_conversation_metadata'; params: GetConversationMetadataParams }
  | { tool: 'api_get_conversation_url'; params: ApiGetConversationUrlParams }
  | { tool: 'api_delete_conversations'; params: ApiDeleteConversationsParams };

export type ToolResponse =
  // LEGACY TOOLS (backward compatibility)
  | { tool: 'spawn_claude_dot_ai_tab'; result: SpawnClaudeDotAiTabResponse }
  | { tool: 'get_claude_dot_ai_tabs'; result: ClaudeDotAiTab[] }
  | { tool: 'get_claude_conversations'; result: ClaudeConversation[] }
  | { tool: 'send_message_to_claude_dot_ai_tab'; result: SendMessageResponse }
  | { tool: 'get_claude_dot_ai_response'; result: ClaudeResponseData }
  | { tool: 'batch_send_messages'; result: BatchSendResponse }
  | { tool: 'get_conversation_metadata'; result: ConversationMetadata }
  | { tool: 'export_conversation_transcript'; result: ConversationTranscript }
  | { tool: 'debug_attach'; result: { success: boolean } }
  | { tool: 'execute_script'; result: any }
  | { tool: 'get_dom_elements'; result: any[] }
  | { tool: 'debug_claude_dot_ai_page'; result: any }
  | { tool: 'delete_claude_conversation'; result: { success: boolean } }
  | { tool: 'reload_extension'; result: { success: boolean } }
  | { tool: 'start_network_inspection'; result: { success: boolean } }
  | { tool: 'stop_network_inspection'; result: { success: boolean } }
  | { tool: 'get_captured_requests'; result: NetworkRequest[] }
  | { tool: 'close_claude_dot_ai_tab'; result: { success: boolean } }
  | { tool: 'open_claude_dot_ai_conversation_tab'; result: { tabId: number } }
  | { tool: 'extract_conversation_elements'; result: { elements: ConversationElement[] } }
  | { tool: 'get_claude_dot_ai_response_status'; result: ResponseStatus }
  | { tool: 'batch_get_responses'; result: BatchResponseResult }
  | { tool: 'get_connection_health'; result: ConnectionHealth }
  | { tool: 'get_tab_pool_stats'; result: TabPoolStats }
  | { tool: 'release_tab_to_pool'; result: { success: boolean; message: string } }
  | { tool: 'configure_tab_pool'; result: { success: boolean; config: any } }
  // NEW REORGANIZED TOOLS (pure domain separation)
  // System tools
  | { tool: 'system_health'; result: ConnectionHealth }
  | { tool: 'system_wait_operation'; result: { success: boolean; message?: string } }
  // Chrome tools
  | { tool: 'chrome_reload_extension'; result: { success: boolean } }
  | { tool: 'chrome_debug_attach'; result: { success: boolean; alreadyAttached?: boolean; external?: boolean } }
  | { tool: 'chrome_debug_detach'; result: { success: boolean; wasDetached?: boolean; reason?: string; error?: string } }
  | { tool: 'chrome_debug_status'; result: { success: boolean; tabId?: number; attached?: boolean; functional?: boolean; session?: any; totalSessions?: number; sessions?: any[] } }
  | { tool: 'chrome_execute_script'; result: any }
  | { tool: 'chrome_get_dom_elements'; result: any[] }
  | { tool: 'chrome_start_network_monitoring'; result: { success: boolean } }
  | { tool: 'chrome_stop_network_monitoring'; result: { success: boolean } }
  | { tool: 'chrome_get_network_requests'; result: NetworkRequest[] }
  // Tab tools
  | { tool: 'tab_create'; result: SpawnClaudeDotAiTabResponse }
  | { tool: 'tab_list'; result: ClaudeDotAiTab[] }
  | { tool: 'tab_close'; result: { success: boolean } }
  | { tool: 'tab_send_message'; result: SendMessageResponse }
  | { tool: 'tab_get_response'; result: ClaudeResponseData }
  | { tool: 'tab_get_response_status'; result: ResponseStatus }
  | { tool: 'tab_forward_response'; result: { success: boolean; message?: string } }
  | { tool: 'tab_extract_elements'; result: { elements: ConversationElement[] } }
  | { tool: 'tab_export_conversation'; result: ConversationTranscript }
  | { tool: 'tab_debug_page'; result: any }
  | { tool: 'tab_batch_operations'; result: TabBatchOperationsResponse }
  // API tools
  | { tool: 'api_list_conversations'; result: ClaudeConversation[] }
  | { tool: 'api_search_conversations'; result: ApiSearchConversationsResponse }
  | { tool: 'api_get_conversation_metadata'; result: ConversationMetadata }
  | { tool: 'api_get_conversation_url'; result: ApiGetConversationUrlResponse }
  | { tool: 'api_delete_conversations'; result: ApiDeleteConversationsResponse };

// ============================================================================
// Type Guards
// ============================================================================

export function isSpawnTabResponse(response: any): response is SpawnClaudeDotAiTabResponse {
  return response && 
    typeof response.success === 'boolean' &&
    typeof response.id === 'number' &&
    typeof response.message === 'string';
}

export function isSendMessageResponse(response: any): response is SendMessageResponse {
  return response && 
    typeof response.success === 'boolean';
}

export function isErrorResponse(response: any): response is { error: string } {
  return response && typeof response.error === 'string';
}