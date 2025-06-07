/**
 * MCP CLI Logger Module
 * 
 * Provides centralized logging for the daemon with file output and rotation.
 */

import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

export interface LoggerOptions {
  logFile: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  componentName: string;
}

/**
 * Create a Winston logger instance
 */
export function createLogger(options: LoggerOptions): winston.Logger {
  const { logFile, logLevel, componentName } = options;
  
  // Ensure log directory exists
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Create logger with console and file transports
  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.printf(({ timestamp, level, message, ...rest }) => {
        const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
        return `[${timestamp}] ${level.toUpperCase()} [${componentName}]: ${message}${extra}`;
      })
    ),
    transports: [
      // Console transport (only for important messages in daemon mode)
      new winston.transports.Console({
        level: 'warn', // Only warnings and errors to console
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      // File transport
      new winston.transports.File({
        filename: logFile,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5, // Keep 5 rotated files
        tailable: true // Allow tailing the log
      })
    ],
    // Handle uncaught exceptions and rejections
    exceptionHandlers: [
      new winston.transports.File({ 
        filename: path.join(logDir, 'daemon-exceptions.log') 
      })
    ],
    rejectionHandlers: [
      new winston.transports.File({ 
        filename: path.join(logDir, 'daemon-rejections.log') 
      })
    ]
  });
  
  // Add convenience method to log with request ID
  (logger as any).logRequest = (level: string, message: string, requestId?: string, data?: any) => {
    const meta = { ...data };
    if (requestId) {
      meta.requestId = requestId;
    }
    logger.log(level, message, meta);
  };
  
  return logger;
}

/**
 * Get log file stats for daemon status
 */
export function getLogFileStats(logFile: string): { 
  exists: boolean; 
  size?: number; 
  modified?: Date;
  readable?: boolean;
} {
  try {
    const stats = fs.statSync(logFile);
    return {
      exists: true,
      size: stats.size,
      modified: stats.mtime,
      readable: fs.accessSync(logFile, fs.constants.R_OK) === undefined
    };
  } catch (error) {
    return { exists: false };
  }
}

/**
 * Format log file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}