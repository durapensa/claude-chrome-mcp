/**
 * Simple logging utility for Claude Chrome MCP
 * 
 * Provides consistent logging with levels and reduced noise
 */

class Logger {
  constructor(component, options = {}) {
    this.component = component;
    this.level = options.level || process.env.CCM_LOG_LEVEL || 'info';
    this.quiet = process.env.CCM_QUIET === '1';
    this.color = options.color !== false && process.stdout?.isTTY;
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      verbose: 4
    };
    
    // Rate limiting for repetitive messages
    this.rateLimits = new Map();
    this.rateLimitWindow = options.rateLimitWindow || 60000; // 1 minute
    this.rateLimitThreshold = options.rateLimitThreshold || 10;
    
    // Colors for terminal output
    this.colors = {
      error: '\x1b[31m',    // red
      warn: '\x1b[33m',     // yellow
      info: '\x1b[36m',     // cyan
      debug: '\x1b[90m',    // gray
      verbose: '\x1b[35m',  // magenta
      reset: '\x1b[0m'
    };
  }
  
  shouldLog(level) {
    if (this.quiet && level !== 'error') return false;
    return this.levels[level] <= this.levels[this.level];
  }
  
  formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const prefix = `[${this.component}:${level}]`;
    
    if (this.color && this.colors[level]) {
      return `${this.colors[level]}${prefix}${this.colors.reset} ${message}`;
    }
    
    return `${prefix} ${message}`;
  }
  
  isRateLimited(key) {
    const now = Date.now();
    const limit = this.rateLimits.get(key);
    
    if (!limit) {
      this.rateLimits.set(key, { count: 1, firstSeen: now });
      return false;
    }
    
    // Reset if window expired
    if (now - limit.firstSeen > this.rateLimitWindow) {
      this.rateLimits.set(key, { count: 1, firstSeen: now });
      return false;
    }
    
    limit.count++;
    
    // Log every Nth occurrence
    if (limit.count === this.rateLimitThreshold) {
      return false; // Log this one with a note
    } else if (limit.count > this.rateLimitThreshold) {
      return true; // Skip
    }
    
    return false;
  }
  
  log(level, message, data, options = {}) {
    if (!this.shouldLog(level)) return;
    
    // Check rate limiting
    if (options.rateLimit) {
      const key = `${level}:${message}`;
      if (this.isRateLimited(key)) return;
      
      const limit = this.rateLimits.get(key);
      if (limit && limit.count === this.rateLimitThreshold) {
        message += ` (repeated ${this.rateLimitThreshold}x, suppressing further logs)`;
      }
    }
    
    const formatted = this.formatMessage(level, message, data);
    const logFn = level === 'error' ? console.error : console.log;
    
    if (data !== undefined) {
      logFn(formatted, data);
    } else {
      logFn(formatted);
    }
  }
  
  error(message, data) {
    this.log('error', message, data);
  }
  
  warn(message, data) {
    this.log('warn', message, data);
  }
  
  info(message, data) {
    this.log('info', message, data);
  }
  
  debug(message, data) {
    this.log('debug', message, data);
  }
  
  verbose(message, data) {
    this.log('verbose', message, data);
  }
  
  // Special method for repetitive logs
  infoLimited(message, data) {
    this.log('info', message, data, { rateLimit: true });
  }
  
  debugLimited(message, data) {
    this.log('debug', message, data, { rateLimit: true });
  }
  
  // Create a child logger with a sub-component name
  child(subComponent) {
    return new Logger(`${this.component}:${subComponent}`, {
      level: this.level,
      color: this.color,
      rateLimitWindow: this.rateLimitWindow,
      rateLimitThreshold: this.rateLimitThreshold
    });
  }
  
  // Set log level dynamically
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.level = level;
    }
  }
}

// Singleton loggers for each component
const loggers = {
  extension: new Logger('Extension'),
  mcp: new Logger('MCP'),
  hub: new Logger('Hub'),
  cli: new Logger('CLI'),
  test: new Logger('Test')
};

// Helper to get or create a logger
function getLogger(component) {
  if (loggers[component]) {
    return loggers[component];
  }
  return new Logger(component);
}

// Export for use in both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Logger,
    getLogger,
    loggers
  };
}