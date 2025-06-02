const fs = require('fs');
const path = require('path');

// Manages async operations with state persistence for MCP operations
class OperationManager {
  constructor() {
    this.operations = new Map();
    this.stateFile = path.join(__dirname, '../../.operations-state.json');
    this.loadState();
  }

  createOperation(type, params = {}) {
    const operationId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    } else if (milestone === 'error') {
      operation.status = 'failed';
    }
    
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
      const startTime = Date.now();
      
      const checkCompletion = () => {
        const operation = this.operations.get(operationId);
        
        if (!operation) {
          reject(new Error(`Operation ${operationId} not found`));
          return;
        }
        
        if (operation.status === 'completed') {
          resolve(operation);
          return;
        }
        
        if (operation.status === 'failed') {
          reject(new Error(`Operation ${operationId} failed`));
          return;
        }
        
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Operation ${operationId} timed out after ${timeoutMs}ms`));
          return;
        }
        
        setTimeout(checkCompletion, 100);
      };
      
      checkCompletion();
    });
  }

  cleanup(maxAge = 3600000) { // 1 hour
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
      console.warn('[OperationManager] Failed to save state:', error.message);
    }
  }
}

module.exports = { OperationManager };