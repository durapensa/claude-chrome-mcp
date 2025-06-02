// Enhanced error handling and debugging utilities
class ErrorTracker {
  constructor(maxErrors = 100) {
    this.errors = [];
    this.maxErrors = maxErrors;
    this.errorCounts = new Map();
  }

  logError(error, context = {}) {
    const errorEntry = {
      timestamp: Date.now(),
      message: error.message || error,
      stack: error.stack,
      context,
      id: this.generateErrorId()
    };

    this.errors.push(errorEntry);
    
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    const errorKey = error.message || error.toString();
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    console.error(`[${errorEntry.id}] Error:`, error.message, context);
    
    return errorEntry.id;
  }

  generateErrorId() {
    return Math.random().toString(36).substr(2, 9);
  }

  getRecentErrors(count = 10) {
    return this.errors.slice(-count);
  }

  getErrorStats() {
    return {
      totalErrors: this.errors.length,
      uniqueErrors: this.errorCounts.size,
      mostFrequentErrors: Array.from(this.errorCounts.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
    };
  }
}

module.exports = { ErrorTracker };