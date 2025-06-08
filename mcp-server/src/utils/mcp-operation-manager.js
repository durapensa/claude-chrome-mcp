const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { createLogger } = require('./logger');
const config = require('../config');

// Manages async operations with state persistence for MCP operations
class MCPOperationManager extends EventEmitter {
  constructor() {
    super();
    this.operations = new Map();
    this.stateFile = path.join(__dirname, '../../.operations-state.json');
    this.pendingCompletions = new Map(); // Track completion promises
    this.logger = createLogger('MCPOperationManager');
    this.loadState();
  }

  createOperation(type, params = {}) {
    // Generate operation ID with tool name format: op_{tool_name}_{timestamp}
    const operationId = `op_${type}_${Date.now()}`;
    const operation = {
      id: operationId,
      type,
      params,
      status: 'pending',
      milestones: [],
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };
    
    this.operations.set(operationId, operation);
    this.saveState();
    
    console.error(`[OperationManager] Created operation ${operationId} of type ${type}`);
    return operationId;
  }

  updateOperation(operationId, milestone, data = {}) {
    const operation = this.operations.get(operationId);
    if (!operation) {
      console.warn(`[OperationManager] Operation ${operationId} not found`);
      return false;
    }

    operation.milestones.push({
      milestone,
      timestamp: Date.now(),
      data
    });
    operation.lastUpdated = Date.now();
    
    // Update status based on milestone
    if (milestone === 'started') {
      operation.status = 'in_progress';
    } else if (milestone === 'completed' || milestone === 'response_completed') {
      operation.status = 'completed';
      // Emit completion event
      this.emit('operation:completed', { operationId, operation });
    } else if (milestone === 'error') {
      operation.status = 'failed';
      // Emit failure event
      this.emit('operation:failed', { operationId, operation, error: data });
    }
    
    // Emit general update event
    this.emit('operation:updated', { operationId, operation, milestone, data });
    
    this.saveState();
    
    console.error(`[OperationManager] Updated operation ${operationId}: ${milestone}`);
    return true;
  }

  getOperation(operationId) {
    return this.operations.get(operationId);
  }

  isCompleted(operationId) {
    const operation = this.operations.get(operationId);
    return operation ? operation.status === 'completed' : false;
  }

  waitForCompletion(operationId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const operation = this.operations.get(operationId);
      
      if (!operation) {
        reject(new Error(`Operation ${operationId} not found`));
        return;
      }
      
      // Check if already completed
      if (operation.status === 'completed') {
        resolve(operation);
        return;
      }
      
      if (operation.status === 'failed') {
        reject(new Error(`Operation ${operationId} failed`));
        return;
      }
      
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error(`Operation ${operationId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      // Event handlers
      const onCompleted = ({ operationId: id, operation: op }) => {
        if (id === operationId) {
          cleanup();
          resolve(op);
        }
      };
      
      const onFailed = ({ operationId: id, operation: op, error }) => {
        if (id === operationId) {
          cleanup();
          reject(new Error(`Operation ${operationId} failed: ${error?.message || 'Unknown error'}`));
        }
      };
      
      // Cleanup function to remove listeners and timeout
      const cleanup = () => {
        clearTimeout(timeoutHandle);
        this.removeListener('operation:completed', onCompleted);
        this.removeListener('operation:failed', onFailed);
      };
      
      // Listen for completion or failure events
      this.on('operation:completed', onCompleted);
      this.on('operation:failed', onFailed);
    });
  }

  getPendingOperations() {
    const pending = [];
    for (const [id, operation] of this.operations) {
      if (operation.status === 'pending' || operation.status === 'in_progress') {
        pending.push({ id, ...operation });
      }
    }
    return pending;
  }

  cleanup(maxAge = config.OPERATION_CLEANUP_AGE) {
    const cutoff = Date.now() - maxAge;
    let cleanedCount = 0;
    
    for (const [id, operation] of this.operations) {
      if (operation.lastUpdated < cutoff) {
        this.operations.delete(id);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.saveState();
      console.error(`[OperationManager] Cleaned up ${cleanedCount} old operations`);
    }
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        this.operations = new Map(data.operations || []);
        console.error(`[OperationManager] Loaded ${this.operations.size} operations from state`);
      }
    } catch (error) {
      console.warn('[OperationManager] Failed to load state:', error.message);
    }
  }

  saveState() {
    try {
      const data = {
        operations: Array.from(this.operations.entries()),
        lastSaved: Date.now()
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.warn('Failed to save state', { error: error.message });
    }
  }
}

module.exports = { MCPOperationManager };