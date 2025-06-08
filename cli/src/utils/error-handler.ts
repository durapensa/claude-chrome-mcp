/**
 * CLI Error Handling Utilities
 * 
 * Comprehensive error handling patterns for CLI components including daemon,
 * client connections, timeout management, and file system operations.
 */

import * as fs from 'fs';
import * as net from 'net';
import { ChildProcess } from 'child_process';
import { DaemonResponse } from '../types/daemon';

export interface ErrorContext {
  context?: string;
  requestId?: string;
  data?: any;
}

export interface TimeoutConfig {
  timeoutMs: number;
  errorMessage?: string;
  onTimeout?: () => void;
}

export interface SocketErrorHandlers {
  onError?: (error: Error) => void;
  onClose?: () => void;
  onData?: (data: Buffer) => void;
}

export interface ProcessErrorHandlers {
  onError?: (error: Error) => void;
  onExit?: (code: number | null, signal: string | null) => void;
  onStderr?: (data: Buffer) => void;
}

/**
 * Standard error response formatter for daemon operations
 */
export function formatDaemonError(
  requestId: string,
  error: Error | string,
  context?: string
): DaemonResponse {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const fullMessage = context ? `${context}: ${errorMessage}` : errorMessage;
  
  return {
    request_id: requestId,
    status: 'error',
    error: fullMessage
  };
}

/**
 * Standard error response formatter for client operations
 */
export function formatClientError(
  error: Error | string,
  context?: string,
  data?: any
): { success: false; error: string; data?: any } {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const fullMessage = context ? `${context}: ${errorMessage}` : errorMessage;
  
  const result: { success: false; error: string; data?: any } = {
    success: false,
    error: fullMessage
  };
  
  if (data) {
    result.data = data;
  }
  
  return result;
}

/**
 * Generic try-catch wrapper with consistent error handling and logging
 */
export function withErrorHandling<T extends any[], R>(
  asyncFunction: (...args: T) => Promise<R>,
  context: string,
  errorFormatter?: (error: Error) => any
): (...args: T) => Promise<R> {
  return async function(...args: T): Promise<R> {
    try {
      return await asyncFunction(...args);
    } catch (error) {
      console.error(`${context}:`, (error as Error).message);
      
      if (errorFormatter) {
        throw errorFormatter(error as Error);
      }
      
      throw error;
    }
  };
}

/**
 * Try-catch wrapper that returns error responses instead of throwing
 */
export function withErrorResponse<T extends any[], R>(
  asyncFunction: (...args: T) => Promise<R>,
  context: string,
  responseFormatter: (error: Error) => any
): (...args: T) => Promise<R | any> {
  return async function(...args: T): Promise<R | any> {
    try {
      return await asyncFunction(...args);
    } catch (error) {
      console.error(`${context}:`, (error as Error).message);
      return responseFormatter(error as Error);
    }
  };
}

/**
 * Timeout management utility with automatic cleanup
 */
export function withTimeout<T>(
  promise: Promise<T>,
  config: TimeoutConfig
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      if (config.onTimeout) {
        config.onTimeout();
      }
      reject(new Error(config.errorMessage || `Operation timeout after ${config.timeoutMs}ms`));
    }, config.timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutHandle);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
}

/**
 * Timeout wrapper for functions with automatic cleanup
 */
export function withTimeoutWrapper<T extends any[], R>(
  asyncFunction: (...args: T) => Promise<R>,
  timeoutMs: number,
  context: string
): (...args: T) => Promise<R> {
  return async function(...args: T): Promise<R> {
    const timeoutConfig: TimeoutConfig = {
      timeoutMs,
      errorMessage: `${context} timeout after ${timeoutMs}ms`
    };
    
    return await withTimeout(asyncFunction(...args), timeoutConfig);
  };
}

/**
 * Socket error handler setup utility
 */
export function setupSocketErrorHandlers(
  socket: net.Socket,
  handlers: SocketErrorHandlers,
  context: string = 'Socket'
): void {
  socket.on('error', (error) => {
    console.error(`${context} error:`, error.message);
    if (handlers.onError) {
      handlers.onError(error);
    }
  });

  socket.on('close', () => {
    console.log(`${context} closed`);
    if (handlers.onClose) {
      handlers.onClose();
    }
  });

  if (handlers.onData) {
    socket.on('data', handlers.onData);
  }
}

/**
 * Process error handler setup utility
 */
export function setupProcessErrorHandlers(
  process: ChildProcess,
  handlers: ProcessErrorHandlers,
  context: string = 'Process'
): void {
  process.on('error', (error) => {
    console.error(`${context} error:`, error.message);
    if (handlers.onError) {
      handlers.onError(error);
    }
  });

  process.on('exit', (code, signal) => {
    console.log(`${context} exited with code ${code}, signal ${signal}`);
    if (handlers.onExit) {
      handlers.onExit(code, signal);
    }
  });

  if (process.stderr && handlers.onStderr) {
    process.stderr.on('data', handlers.onStderr);
  }
}

/**
 * File system operation wrapper with error context
 */
export function withFileSystemError<T extends any[], R>(
  fsFunction: (...args: T) => R,
  context: string,
  filePath?: string
): (...args: T) => R {
  return function(...args: T): R {
    try {
      return fsFunction(...args);
    } catch (error) {
      const pathContext = filePath ? ` (${filePath})` : '';
      const fullContext = `${context}${pathContext}`;
      throw new Error(`${fullContext}: ${(error as Error).message}`);
    }
  };
}

/**
 * Async file system operation wrapper
 */
export function withAsyncFileSystemError<T extends any[], R>(
  asyncFsFunction: (...args: T) => Promise<R>,
  context: string,
  filePath?: string
): (...args: T) => Promise<R> {
  return async function(...args: T): Promise<R> {
    try {
      return await asyncFsFunction(...args);
    } catch (error) {
      const pathContext = filePath ? ` (${filePath})` : '';
      const fullContext = `${context}${pathContext}`;
      throw new Error(`${fullContext}: ${(error as Error).message}`);
    }
  };
}

/**
 * JSON parsing with error context
 */
export function safeJsonParse<T = any>(
  jsonString: string,
  context: string = 'JSON parse'
): T | null {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error(`${context} failed:`, (error as Error).message);
    return null;
  }
}

/**
 * JSON parsing that throws with context
 */
export function parseJsonWithContext<T = any>(
  jsonString: string,
  context: string = 'JSON parse'
): T {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`${context}: ${(error as Error).message}`);
  }
}

/**
 * Request/response pattern manager for pending operations
 */
export class RequestManager<TRequest, TResponse> {
  private pendingRequests = new Map<string, {
    resolve: (response: TResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    context: string;
  }>();

  constructor(private defaultTimeoutMs: number = 30000) {}

  /**
   * Register a new request with timeout
   */
  registerRequest(
    requestId: string,
    resolve: (response: TResponse) => void,
    reject: (error: Error) => void,
    context: string,
    timeoutMs?: number
  ): void {
    const effectiveTimeout = timeoutMs || this.defaultTimeoutMs;
    
    const timeout = setTimeout(() => {
      this.pendingRequests.delete(requestId);
      reject(new Error(`${context} timeout after ${effectiveTimeout}ms (ID: ${requestId})`));
    }, effectiveTimeout);

    this.pendingRequests.set(requestId, {
      resolve,
      reject,
      timeout,
      context
    });
  }

  /**
   * Resolve a pending request
   */
  resolveRequest(requestId: string, response: TResponse): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(response);
      return true;
    }
    return false;
  }

  /**
   * Reject a pending request
   */
  rejectRequest(requestId: string, error: Error): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.reject(error);
      return true;
    }
    return false;
  }

  /**
   * Clean up all pending requests with error
   */
  cleanup(error: Error = new Error('Connection closed')): void {
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${pending.context}: ${error.message} (ID: ${requestId})`));
    }
    this.pendingRequests.clear();
  }

  /**
   * Get pending request count
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Get pending request contexts for debugging
   */
  getPendingContexts(): Array<{ requestId: string; context: string }> {
    return Array.from(this.pendingRequests.entries()).map(([requestId, pending]) => ({
      requestId,
      context: pending.context
    }));
  }
}

/**
 * Configuration validation utility
 */
export function validateConfig<T>(
  config: any,
  requiredFields: (keyof T)[],
  context: string = 'Configuration'
): string[] {
  const errors: string[] = [];
  
  for (const field of requiredFields) {
    if (!config || typeof config !== 'object') {
      errors.push(`${context}: configuration must be an object`);
      break;
    }
    
    if (config[field] === undefined || config[field] === null) {
      errors.push(`${context}: '${String(field)}' is required`);
    }
  }
  
  return errors;
}

/**
 * Type-safe error handling for promises with specific error types
 */
export async function handleSpecificErrors<T, E extends Error>(
  promise: Promise<T>,
  errorHandlers: Map<new (...args: any[]) => E, (error: E) => T | Promise<T>>,
  defaultHandler?: (error: Error) => T | Promise<T>
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    for (const [ErrorType, handler] of errorHandlers) {
      if (error instanceof ErrorType) {
        return await handler(error);
      }
    }
    
    if (defaultHandler) {
      return await defaultHandler(error as Error);
    }
    
    throw error;
  }
}

/**
 * Retry utility with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000,
  context: string = 'Operation'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw new Error(`${context} failed after ${maxAttempts} attempts: ${lastError.message}`);
      }
      
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`${context} attempt ${attempt} failed, retrying in ${delayMs}ms:`, lastError.message);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError!;
}