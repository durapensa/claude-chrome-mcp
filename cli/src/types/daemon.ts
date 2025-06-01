/**
 * Universal MCP CLI - Daemon Communication Types
 * 
 * Types for communication between CLI client and daemon process.
 */

import { MCPConnection } from './mcp';
import { ServerConfig } from './config';

// ===== Daemon Communication Types =====

export type DaemonRequestType = 
  | 'tool_call' 
  | 'list_tools' 
  | 'server_status' 
  | 'start_server'
  | 'stop_server'
  | 'shutdown';

export interface DaemonRequest {
  type: DaemonRequestType;
  server_id?: string;
  tool_name?: string;
  args?: Record<string, any>;
  request_id: string;
  timeout?: number;
}

export type DaemonResponseStatus = 'success' | 'error' | 'progress';

export interface DaemonResponse {
  request_id: string;
  status: DaemonResponseStatus;
  data?: any;
  error?: string;
  progress?: {
    message: string;
    step: number;
    total: number;
  };
}

// ===== Server Management Types =====

export type ServerStatus = 'stopped' | 'starting' | 'ready' | 'error' | 'idle';

export interface MCPServer {
  id: string;
  config: ServerConfig;
  status: ServerStatus;
  process: any | null;              // ChildProcess
  connection: MCPConnection | null;
  tools: QualifiedTool[];
  lastUsed: Date;
  startTime?: Date;
  error?: string;
}

// ===== Tool Registry Types =====

export interface QualifiedTool {
  name: string;                        // Tool name
  server_id: string;                   // Owning server
  schema: any;                         // JSONSchema7 - MCP tool schema
  canonical: boolean;                  // First-defined (default when unqualified)
  description: string;                 // Tool description
}

export interface ToolNamespace {
  tools: Map<string, QualifiedTool>;   // tool_name → canonical tool
  collisions: Map<string, string[]>;   // tool_name → [server1, server2, ...]
  byServer: Map<string, QualifiedTool[]>; // server_id → tools
}

// ===== Utility Types =====

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  message: string;
  data?: any;
}

export interface HealthCheckResult {
  server_id: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  response_time?: number;
  error?: string;
  last_check: Date;
}