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

export interface MCPToolResponse {
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