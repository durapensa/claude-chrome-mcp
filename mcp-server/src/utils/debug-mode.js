// Debug logging utilities
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Create log directory
const logDir = config.LOG_DIR;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create Winston logger with file transport
const fileLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, `claude-chrome-mcp-server-debug-PID-${process.pid}.log`),
      level: 'debug'
    })
  ]
});

class DebugMode {
  constructor() {
    this.enabled = process.env.CCM_DEBUG === '1' || process.env.NODE_ENV === 'development';
    this.verboseEnabled = process.env.CCM_VERBOSE === '1';
    this.loggers = new Map();
    
    // Log startup
    fileLogger.info('MCP Server starting', {
      pid: process.pid,
      ppid: process.ppid,
      env: {
        CCM_DEBUG: process.env.CCM_DEBUG,
        NODE_ENV: process.env.NODE_ENV
      }
    });
  }

  createLogger(component) {
    const logger = {
      debug: (message, data = {}) => {
        fileLogger.debug(message, { component, ...data });
        if (this.enabled) {
          console.error(`[${component}] DEBUG:`, message, data);
        }
      },
      
      verbose: (message, data = {}) => {
        fileLogger.verbose(message, { component, ...data });
        if (this.verboseEnabled) {
          console.error(`[${component}] VERBOSE:`, message, data);
        }
      },
      
      info: (message, data = {}) => {
        fileLogger.info(message, { component, ...data });
        console.error(`[${component}] INFO:`, message, data);
      },
      
      warn: (message, data = {}) => {
        fileLogger.warn(message, { component, ...data });
        console.error(`[${component}] WARN:`, message, data);
      },
      
      error: (message, error = null, data = {}) => {
        fileLogger.error(message, { component, error: error?.message || error, ...data });
        console.error(`[${component}] ERROR:`, message, error?.message || error, data);
      }
    };

    this.loggers.set(component, logger);
    return logger;
  }

  getLogger(component) {
    return this.loggers.get(component) || this.createLogger(component);
  }
}

module.exports = { DebugMode };