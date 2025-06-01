/**
 * Universal MCP CLI - MCP Protocol Types
 * 
 * Types for MCP protocol communication and tool definitions.
 */

import { JSONSchema7 } from 'json-schema';

// ===== MCP Protocol Types =====

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
}

export interface MCPToolsListResponse {
  tools: MCPTool[];
}

export interface MCPToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    url?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPConnection {
  sendRequest(request: MCPRequest): Promise<MCPResponse>;
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args: Record<string, any>): Promise<MCPToolCallResponse>;
  close(): Promise<void>;
}