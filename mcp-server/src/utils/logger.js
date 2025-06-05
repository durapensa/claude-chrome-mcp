// Winston-based logging for MCP server
const winston = require('winston');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Create log directory
const logDir = path.join(os.homedir(), '.claude-chrome-mcp', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for stderr output (maintains MCP compatibility)
const stderrFormat = winston.format.printf(({ level, message, component, timestamp, ...meta }) => {
  const prefix = component ? `[${component}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${prefix} ${level.toUpperCase()}: ${message}${metaStr}`;
});

// Create main logger with both file and stderr transports
const mainLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // File transport with rotation
    new winston.transports.File({
      filename: path.join(logDir, `claude-chrome-mcp-server-PID-${process.pid}.log`),
      level: 'debug',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    // Stderr transport for MCP compatibility (stdout must remain clean for JSON-RPC)
    new winston.transports.Stream({
      stream: process.stderr,
      format: winston.format.combine(
        winston.format.colorize(),
        stderrFormat
      )
    })
  ]
});

// Log startup
mainLogger.info('MCP Server logger initialized', {
  pid: process.pid,
  ppid: process.ppid,
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir,
  env: {
    NODE_ENV: process.env.NODE_ENV,
    CCM_DEBUG: process.env.CCM_DEBUG,
    CCM_VERBOSE: process.env.CCM_VERBOSE
  }
});

// Component logger factory
class Logger {
  constructor(component) {
    this.component = component;
    this.child = mainLogger.child({ component });
  }

  // Standard log levels
  error(message, error = null, meta = {}) {
    if (error instanceof Error) {
      this.child.error(message, { 
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        ...meta 
      });
    } else if (error) {
      this.child.error(message, { error, ...meta });
    } else {
      this.child.error(message, meta);
    }
  }

  warn(message, meta = {}) {
    this.child.warn(message, meta);
  }

  info(message, meta = {}) {
    this.child.info(message, meta);
  }

  debug(message, meta = {}) {
    this.child.debug(message, meta);
  }

  verbose(message, meta = {}) {
    // Winston doesn't have verbose by default, map to silly
    this.child.silly(message, meta);
  }

  // Timing helper
  time(label) {
    const start = Date.now();
    return {
      end: (message, meta = {}) => {
        const duration = Date.now() - start;
        this.info(message, { duration, label, ...meta });
      }
    };
  }
}

// Singleton logger cache
const loggers = new Map();

// Export factory function
function createLogger(component) {
  if (!loggers.has(component)) {
    loggers.set(component, new Logger(component));
  }
  return loggers.get(component);
}

// Handle process termination
process.on('SIGINT', () => {
  mainLogger.info('Logger shutting down on SIGINT');
  mainLogger.end();
});

process.on('SIGTERM', () => {
  mainLogger.info('Logger shutting down on SIGTERM');
  mainLogger.end();
});

module.exports = { createLogger };