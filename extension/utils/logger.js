// Centralized logging utility for Chrome Extension
// Browser-compatible logging system with structured output

class ExtensionLogger {
  constructor() {
    this.logLevel = this.getLogLevel();
    this.logBuffer = [];
    this.maxBufferSize = 1000;
    this.enabledComponents = this.getEnabledComponents();
    
    // Log levels in order of severity
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
      VERBOSE: 4
    };
    
    // Colors for console output
    this.colors = {
      ERROR: '#ff4444',
      WARN: '#ffaa00',
      INFO: '#0088ff',
      DEBUG: '#888888',
      VERBOSE: '#cccccc'
    };
  }
  
  getLogLevel() {
    // Try to get from extension storage, fallback to INFO
    try {
      const stored = localStorage.getItem('ccm-log-level');
      return stored || 'INFO';
    } catch {
      return 'INFO';
    }
  }
  
  getEnabledComponents() {
    // Allow filtering by component names
    try {
      const stored = localStorage.getItem('ccm-enabled-components');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
  
  shouldLog(level, component) {
    // Check if log level allows this message
    const levelNum = this.levels[level];
    const configLevelNum = this.levels[this.logLevel];
    
    if (levelNum > configLevelNum) {
      return false;
    }
    
    // Check if component is filtered
    if (this.enabledComponents.length > 0 && !this.enabledComponents.includes(component)) {
      return false;
    }
    
    return true;
  }
  
  formatMessage(level, component, message, data) {
    const timestamp = new Date().toISOString();
    const formattedData = data && Object.keys(data).length > 0 ? data : null;
    
    return {
      timestamp,
      level,
      component,
      message,
      data: formattedData,
      pid: 'extension' // Identify as extension log
    };
  }
  
  addToBuffer(logEntry) {
    this.logBuffer.push(logEntry);
    
    // Keep buffer size manageable
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift();
    }
  }
  
  outputToConsole(level, component, message, data) {
    const color = this.colors[level];
    const prefix = `[CCM-${component}]`;
    
    const style = `color: ${color}; font-weight: bold;`;
    
    if (data && Object.keys(data).length > 0) {
      console.log(`%c${prefix} ${level}:`, style, message, data);
    } else {
      console.log(`%c${prefix} ${level}:`, style, message);
    }
  }
  
  createComponentLogger(component) {
    return {
      error: (message, data = {}) => this.log('ERROR', component, message, data),
      warn: (message, data = {}) => this.log('WARN', component, message, data),
      info: (message, data = {}) => this.log('INFO', component, message, data),
      debug: (message, data = {}) => this.log('DEBUG', component, message, data),
      verbose: (message, data = {}) => this.log('VERBOSE', component, message, data)
    };
  }
  
  log(level, component, message, data = {}) {
    if (!this.shouldLog(level, component)) {
      return;
    }
    
    const logEntry = this.formatMessage(level, component, message, data);
    this.addToBuffer(logEntry);
    this.outputToConsole(level, component, message, data);
    
    // For errors, also send to extension error tracking if available
    if (level === 'ERROR' && window.chrome?.runtime) {
      try {
        chrome.runtime.sendMessage({
          type: 'LOG_ERROR',
          data: logEntry
        }).catch(() => {}); // Ignore if background script is not available
      } catch (e) {
        // Ignore messaging errors
      }
    }
  }
  
  // Utility methods
  setLogLevel(level) {
    if (this.levels.hasOwnProperty(level)) {
      this.logLevel = level;
      try {
        localStorage.setItem('ccm-log-level', level);
      } catch (e) {
        console.warn('Failed to save log level to localStorage');
      }
    }
  }
  
  setEnabledComponents(components) {
    this.enabledComponents = Array.isArray(components) ? components : [];
    try {
      localStorage.setItem('ccm-enabled-components', JSON.stringify(this.enabledComponents));
    } catch (e) {
      console.warn('Failed to save enabled components to localStorage');
    }
  }
  
  getLogBuffer() {
    return [...this.logBuffer];
  }
  
  clearLogBuffer() {
    this.logBuffer = [];
  }
  
  exportLogs() {
    return {
      logs: this.getLogBuffer(),
      exported_at: new Date().toISOString(),
      config: {
        logLevel: this.logLevel,
        enabledComponents: this.enabledComponents
      }
    };
  }
}

// Create singleton instance
const extensionLogger = new ExtensionLogger();

// Note: No window object in service worker context (Manifest V3)

// Export factory function  
export function createLogger(component) {
  return extensionLogger.createComponentLogger(component);
}

// Export main logger
export { extensionLogger };
export default extensionLogger;