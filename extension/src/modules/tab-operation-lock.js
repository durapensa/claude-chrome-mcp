// Tab Operation Lock to prevent concurrent operations on the same tab

export class TabOperationLock {
  constructor() {
    this.locks = new Map(); // tabId -> { operation, timestamp, resolver }
    this.lockTimeouts = new Map(); // tabId -> timeoutId
  }

  async acquireLock(tabId, operation, timeout = 30000) {
    // Check if there's an existing lock
    if (this.locks.has(tabId)) {
      const existingLock = this.locks.get(tabId);
      console.log(`CCM: Tab ${tabId} is locked by operation: ${existingLock.operation}`);
      
      // Wait for the existing lock to be released
      await existingLock.promise;
      
      // Small delay to ensure clean state transition
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Create a new lock
    let resolver;
    const promise = new Promise(resolve => {
      resolver = resolve;
    });

    this.locks.set(tabId, {
      operation,
      timestamp: Date.now(),
      promise,
      resolver
    });

    // Set timeout for auto-release
    const timeoutId = setTimeout(() => {
      console.warn(`CCM: Lock timeout for tab ${tabId}, operation: ${operation}`);
      this.releaseLock(tabId);
    }, timeout);

    this.lockTimeouts.set(tabId, timeoutId);

    console.log(`CCM: Lock acquired for tab ${tabId}, operation: ${operation}`);
  }

  releaseLock(tabId) {
    const lock = this.locks.get(tabId);
    if (lock) {
      // Clear timeout
      const timeoutId = this.lockTimeouts.get(tabId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.lockTimeouts.delete(tabId);
      }

      // Resolve the promise
      lock.resolver();

      // Remove the lock
      this.locks.delete(tabId);

      console.log(`CCM: Lock released for tab ${tabId}, operation: ${lock.operation}`);
    }
  }

  isLocked(tabId) {
    return this.locks.has(tabId);
  }

  getLockInfo(tabId) {
    return this.locks.get(tabId) || null;
  }

  getAllLocks() {
    const lockInfo = [];
    for (const [tabId, lock] of this.locks) {
      lockInfo.push({
        tabId,
        operation: lock.operation,
        duration: Date.now() - lock.timestamp
      });
    }
    return lockInfo;
  }
}