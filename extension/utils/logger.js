// Centralized logging utility for Chrome Extension
// Browser-compatible logging system with structured output

class ExtensionLogger {
  constructor() {
    this.logLevel = this.getLogLevel();
    this.logBuffer = [];
    this.maxBufferSize = 1000;
    this.enabledComponents = this.getEnabledComponents();
    
    // Debug mode settings
    this.debugMode = false;
    this.debugSettings = {
      components: [],
      errorOnly: false,
      batchIntervalMs: 2000,
      sendToMCP: null
    };
    this.logBatch = [];
    this.batchTimer = null;
    
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
    
    // Initialize debug mode from storage
    this.initDebugMode();
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
        enabledComponents: this.enabledComponents,
        debugMode: this.debugMode,
        debugSettings: this.debugSettings
      }
    };
  }
  
  // Initialize debug mode from storage
  async initDebugMode() {
    if (chrome?.storage?.local) {
      try {
        const settings = await chrome.storage.local.get([
          'ccm-debug-mode-enabled',
          'ccm-debug-components',
          'ccm-debug-error-only',
          'ccm-debug-batch-interval'
        ]);
        
        if (settings['ccm-debug-mode-enabled']) {
          this.debugMode = true;
          this.debugSettings.components = settings['ccm-debug-components'] || [];
          this.debugSettings.errorOnly = settings['ccm-debug-error-only'] || false;
          this.debugSettings.batchIntervalMs = settings['ccm-debug-batch-interval'] || 2000;
        }
      } catch (e) {
        // Ignore storage errors
      }
    }
  }
  
  // Set debug mode
  setDebugMode(enabled, settings = {}) {
    this.debugMode = enabled;
    
    if (enabled) {
      this.debugSettings = {
        ...this.debugSettings,
        ...settings
      };
      
      // Start batch timer if needed
      if (!this.debugSettings.errorOnly) {
        this.startBatchTimer();
      }
    } else {
      // Clear batch timer
      this.stopBatchTimer();
      this.sendBatch(); // Send any remaining logs
    }
  }
  
  // Start batch timer for non-error logs
  startBatchTimer() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    this.batchTimer = setInterval(() => {
      this.sendBatch();
    }, this.debugSettings.batchIntervalMs);
  }
  
  // Stop batch timer
  stopBatchTimer() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }
  
  // Send batched logs
  sendBatch() {
    if (this.logBatch.length === 0 || !this.debugSettings.sendToMCP) {
      return;
    }
    
    // Send batch as a single notification
    const batch = [...this.logBatch];
    this.logBatch = [];
    
    this.debugSettings.sendToMCP({
      type: 'log_batch',
      logs: batch,
      count: batch.length,
      timestamp: Date.now()
    });
  }
  
  // Override log method to handle debug mode
  log(level, component, message, data = {}) {
    if (!this.shouldLog(level, component)) {
      return;
    }
    
    const logEntry = this.formatMessage(level, component, message, data);
    this.addToBuffer(logEntry);
    this.outputToConsole(level, component, message, data);
    
    // Handle debug mode forwarding
    if (this.debugMode && this.debugSettings.sendToMCP) {
      // Check component filter
      if (this.debugSettings.components.length > 0 && 
          !this.debugSettings.components.includes(component)) {
        return;
      }
      
      // ERROR logs are sent immediately
      if (level === 'ERROR') {
        this.debugSettings.sendToMCP(logEntry);
      } else if (!this.debugSettings.errorOnly) {
        // Other logs are batched
        this.logBatch.push(logEntry);
      }
    }
    
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