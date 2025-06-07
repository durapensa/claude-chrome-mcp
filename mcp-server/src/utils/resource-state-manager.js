const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { createLogger } = require('./logger');

/**
 * ResourceStateManager - Persistent state management for critical extension resources
 * 
 * Addresses Issue #2: State fragmentation across WebSocket boundary
 * Persists critical state that must survive extension restarts
 */
class ResourceStateManager extends EventEmitter {
  constructor() {
    super();
    this.stateFile = path.join(__dirname, '../../.resource-state.json');
    this.logger = createLogger('ResourceStateManager');
    
    // Critical state maps (persisted)
    this.debuggerSessions = new Map();     // tabId → DebuggerSessionState
    this.operationLocks = new Map();       // tabId → OperationLockState  
    this.networkMonitoring = new Map();    // tabId → NetworkMonitoringState
    this.contentScripts = new Map();       // tabId → ContentScriptState
    
    // Operational state (runtime coordination)
    this.pendingRequests = new Map();      // requestId → RequestState
    this.relayClients = new Map();         // clientId → ClientState
    
    // State metadata
    this.metadata = {
      lastSaved: null,
      lastLoaded: null,
      version: '1.0.0',
      extensionStartupTime: null
    };
    
    this.loadState();
  }

  // === DEBUGGER SESSION MANAGEMENT ===
  
  /**
   * Register debugger session attachment
   * @param {number} tabId - Chrome tab ID
   * @param {string} source - 'self'|'external'|'existing' 
   * @param {string} purpose - Reason for attachment
   * @returns {boolean} Success
   */
  attachDebuggerSession(tabId, source = 'self', purpose = 'unknown') {
    const session = {
      tabId,
      attached: true,
      attachedAt: Date.now(),
      source,
      purpose,
      protocol: 'Runtime', // Default protocol
      // Recovery info for extension restart
      recovery: {
        canDetach: source === 'self', // Only detach if we created it
        verified: false,
        lastVerified: null
      }
    };
    
    this.debuggerSessions.set(tabId, session);
    this.saveState();
    
    this.logger.debug(`Debugger session registered`, { tabId, source, purpose });
    this.emit('debugger:attached', { tabId, session });
    
    return true;
  }

  /**
   * Unregister debugger session
   * @param {number} tabId - Chrome tab ID
   * @returns {boolean} Success
   */
  detachDebuggerSession(tabId) {
    const session = this.debuggerSessions.get(tabId);
    if (!session) {
      return false;
    }
    
    this.debuggerSessions.delete(tabId);
    this.saveState();
    
    this.logger.debug(`Debugger session unregistered`, { tabId });
    this.emit('debugger:detached', { tabId, session });
    
    return true;
  }

  /**
   * Verify debugger session is still active
   * @param {number} tabId - Chrome tab ID
   * @returns {Object} Verification result
   */
  verifyDebuggerSession(tabId) {
    const session = this.debuggerSessions.get(tabId);
    if (!session) {
      return { exists: false };
    }

    // Mark as verified
    session.recovery.verified = true;
    session.recovery.lastVerified = Date.now();
    this.saveState();

    return { 
      exists: true, 
      session,
      canDetach: session.recovery.canDetach,
      age: Date.now() - session.attachedAt 
    };
  }

  /**
   * Get all orphaned debugger sessions (need cleanup)
   * @returns {Array} Sessions needing cleanup
   */
  getOrphanedDebuggerSessions() {
    const orphaned = [];
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const [tabId, session] of this.debuggerSessions) {
      const isStale = !session.recovery.verified && 
                     (now - session.attachedAt) > staleThreshold;
      
      if (isStale) {
        orphaned.push({ tabId, session });
      }
    }
    
    return orphaned;
  }

  // === OPERATION LOCK MANAGEMENT ===
  
  /**
   * Acquire operation lock for tab
   * @param {number} tabId - Chrome tab ID  
   * @param {string} operation - Operation name
   * @param {string} clientId - Client acquiring lock
   * @param {number} timeout - Lock timeout in ms
   * @returns {boolean} Success
   */
  acquireOperationLock(tabId, operation, clientId, timeout = 30000) {
    // Check if tab already locked
    if (this.operationLocks.has(tabId)) {
      const existing = this.operationLocks.get(tabId);
      this.logger.warn(`Tab ${tabId} already locked by ${existing.operation}`);
      return false;
    }

    const lock = {
      tabId,
      operation,
      acquiredBy: clientId,
      acquiredAt: Date.now(),
      timeout,
      // Recovery info
      recovery: {
        canRelease: true,
        autoReleaseAt: Date.now() + timeout
      }
    };

    this.operationLocks.set(tabId, lock);
    this.saveState();

    this.logger.debug(`Operation lock acquired`, { tabId, operation, clientId });
    this.emit('lock:acquired', { tabId, lock });

    // Set auto-release timer
    setTimeout(() => {
      this.releaseOperationLock(tabId, 'timeout');
    }, timeout);

    return true;
  }

  /**
   * Release operation lock
   * @param {number} tabId - Chrome tab ID
   * @param {string} reason - Release reason
   * @returns {boolean} Success  
   */
  releaseOperationLock(tabId, reason = 'manual') {
    const lock = this.operationLocks.get(tabId);
    if (!lock) {
      return false;
    }

    this.operationLocks.delete(tabId);
    this.saveState();

    this.logger.debug(`Operation lock released`, { tabId, reason });
    this.emit('lock:released', { tabId, lock, reason });

    return true;
  }

  /**
   * Get all expired operation locks
   * @returns {Array} Expired locks
   */
  getExpiredOperationLocks() {
    const expired = [];
    const now = Date.now();

    for (const [tabId, lock] of this.operationLocks) {
      if (now > lock.recovery.autoReleaseAt) {
        expired.push({ tabId, lock });
      }
    }

    return expired;
  }

  // === NETWORK MONITORING MANAGEMENT ===
  
  /**
   * Start network monitoring for tab
   * @param {number} tabId - Chrome tab ID
   * @param {string} debuggerSessionId - Associated debugger session
   * @returns {boolean} Success
   */
  startNetworkMonitoring(tabId, debuggerSessionId = null) {
    const monitoring = {
      tabId,
      active: true,
      startedAt: Date.now(),
      debuggerSessionId,
      capturedRequests: [],
      // Recovery info
      recovery: {
        requiresDebugger: !!debuggerSessionId,
        canStop: true
      }
    };

    this.networkMonitoring.set(tabId, monitoring);
    this.saveState();

    this.logger.debug(`Network monitoring started`, { tabId });
    this.emit('network:started', { tabId, monitoring });

    return true;
  }

  /**
   * Stop network monitoring
   * @param {number} tabId - Chrome tab ID
   * @returns {boolean} Success
   */
  stopNetworkMonitoring(tabId) {
    const monitoring = this.networkMonitoring.get(tabId);
    if (!monitoring) {
      return false;
    }

    this.networkMonitoring.delete(tabId);
    this.saveState();

    this.logger.debug(`Network monitoring stopped`, { tabId });
    this.emit('network:stopped', { tabId, monitoring });

    return true;
  }

  // === CONTENT SCRIPT MANAGEMENT ===
  
  /**
   * Register content script injection
   * @param {number} tabId - Chrome tab ID
   * @param {string} version - Extension version
   * @param {Array} worlds - Injected worlds
   * @returns {boolean} Success
   */
  registerContentScript(tabId, version, worlds = ['MAIN', 'ISOLATED']) {
    const script = {
      tabId,
      injected: true,
      injectedAt: Date.now(),
      version,
      worlds,
      // Recovery info
      recovery: {
        canVerify: true,
        lastVerified: null,
        needsReinjection: false
      }
    };

    this.contentScripts.set(tabId, script);
    this.saveState();

    this.logger.debug(`Content script registered`, { tabId, version, worlds });
    this.emit('script:injected', { tabId, script });

    return true;
  }

  /**
   * Unregister content script
   * @param {number} tabId - Chrome tab ID
   * @returns {boolean} Success
   */
  unregisterContentScript(tabId) {
    const script = this.contentScripts.get(tabId);
    if (!script) {
      return false;
    }

    this.contentScripts.delete(tabId);
    this.saveState();

    this.logger.debug(`Content script unregistered`, { tabId });
    this.emit('script:removed', { tabId, script });

    return true;
  }

  // === EXTENSION RESTART RECOVERY ===
  
  /**
   * Handle extension restart - verify and cleanup orphaned resources
   * @param {number} extensionStartupTime - Extension startup timestamp
   * @returns {Object} Recovery results
   */
  async handleExtensionRestart(extensionStartupTime) {
    this.metadata.extensionStartupTime = extensionStartupTime;
    
    const results = {
      debuggerSessionsFound: this.debuggerSessions.size,
      operationLocksFound: this.operationLocks.size,
      networkMonitoringFound: this.networkMonitoring.size,
      contentScriptsFound: this.contentScripts.size,
      cleanupRequired: [],
      recoveryActions: []
    };

    // Check for stale debugger sessions
    const orphanedSessions = this.getOrphanedDebuggerSessions();
    if (orphanedSessions.length > 0) {
      results.cleanupRequired.push({
        type: 'debugger_sessions',
        count: orphanedSessions.length,
        sessions: orphanedSessions
      });
    }

    // Check for expired operation locks
    const expiredLocks = this.getExpiredOperationLocks();
    if (expiredLocks.length > 0) {
      results.cleanupRequired.push({
        type: 'operation_locks', 
        count: expiredLocks.length,
        locks: expiredLocks
      });
      
      // Auto-cleanup expired locks
      for (const { tabId } of expiredLocks) {
        this.releaseOperationLock(tabId, 'extension_restart');
      }
      results.recoveryActions.push(`Released ${expiredLocks.length} expired locks`);
    }

    this.logger.info(`Extension restart recovery completed`, results);
    this.emit('recovery:completed', results);

    return results;
  }

  // === STATE PERSISTENCE ===
  
  /**
   * Load state from persistent storage
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        
        // Load critical state
        this.debuggerSessions = new Map(data.debuggerSessions || []);
        this.operationLocks = new Map(data.operationLocks || []);
        this.networkMonitoring = new Map(data.networkMonitoring || []);
        this.contentScripts = new Map(data.contentScripts || []);
        
        // Load operational state (may be stale)
        this.pendingRequests = new Map(data.pendingRequests || []);
        this.relayClients = new Map(data.relayClients || []);
        
        // Load metadata
        this.metadata = { ...this.metadata, ...data.metadata };
        this.metadata.lastLoaded = Date.now();
        
        const totalResources = this.debuggerSessions.size + this.operationLocks.size + 
                              this.networkMonitoring.size + this.contentScripts.size;
        
        this.logger.info(`Resource state loaded: ${totalResources} resources from persistent storage`);
      }
    } catch (error) {
      this.logger.warn('Failed to load resource state', { error: error.message });
    }
  }

  /**
   * Save state to persistent storage
   */
  saveState() {
    try {
      const data = {
        // Critical state (always persisted)
        debuggerSessions: Array.from(this.debuggerSessions.entries()),
        operationLocks: Array.from(this.operationLocks.entries()),
        networkMonitoring: Array.from(this.networkMonitoring.entries()),
        contentScripts: Array.from(this.contentScripts.entries()),
        
        // Operational state (may be cleared on restart)
        pendingRequests: Array.from(this.pendingRequests.entries()),
        relayClients: Array.from(this.relayClients.entries()),
        
        // Metadata
        metadata: {
          ...this.metadata,
          lastSaved: Date.now()
        }
      };
      
      fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.warn('Failed to save resource state', { error: error.message });
    }
  }

  /**
   * Get complete state summary
   * @returns {Object} State summary
   */
  getStateSummary() {
    return {
      debuggerSessions: this.debuggerSessions.size,
      operationLocks: this.operationLocks.size,
      networkMonitoring: this.networkMonitoring.size,
      contentScripts: this.contentScripts.size,
      pendingRequests: this.pendingRequests.size,
      relayClients: this.relayClients.size,
      metadata: this.metadata
    };
  }

  /**
   * Clear all state (for testing/cleanup)
   */
  clearState() {
    this.debuggerSessions.clear();
    this.operationLocks.clear();
    this.networkMonitoring.clear();
    this.contentScripts.clear();
    this.pendingRequests.clear();
    this.relayClients.clear();
    
    this.metadata.lastSaved = null;
    this.metadata.lastLoaded = null;
    
    this.saveState();
    this.logger.info('Resource state cleared');
  }
}

module.exports = { ResourceStateManager };