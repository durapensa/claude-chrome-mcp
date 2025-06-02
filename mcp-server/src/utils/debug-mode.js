// Debug logging utilities
class DebugMode {
  constructor() {
    this.enabled = process.env.CCM_DEBUG === '1' || process.env.NODE_ENV === 'development';
    this.verboseEnabled = process.env.CCM_VERBOSE === '1';
    this.loggers = new Map();
  }

  createLogger(component) {
    const logger = {
      debug: (message, data = {}) => {
        if (this.enabled) {
          console.error(`[${component}] DEBUG:`, message, data);
        }
      },
      
      verbose: (message, data = {}) => {
        if (this.verboseEnabled) {
          console.error(`[${component}] VERBOSE:`, message, data);
        }
      },
      
      info: (message, data = {}) => {
        console.error(`[${component}] INFO:`, message, data);
      },
      
      warn: (message, data = {}) => {
        console.error(`[${component}] WARN:`, message, data);
      },
      
      error: (message, error = null, data = {}) => {
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