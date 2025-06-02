// Handles MCP notification sending for operation progress and completion
class NotificationManager {
  constructor(server) {
    this.server = server;
  }

  sendProgress(operationId, milestone, data = {}) {
    const notification = {
      method: 'notifications/operation/progress',
      params: {
        operationId,
        milestone,
        timestamp: Date.now(),
        ...data
      }
    };
    
    console.log(`[NotificationManager] Sending progress: ${operationId} - ${milestone}`);
    
    try {
      this.server.sendNotification('operation/progress', notification.params);
    } catch (error) {
      console.warn('[NotificationManager] Failed to send notification:', error.message);
    }
  }

  sendCompletion(operationId, result = {}) {
    this.sendProgress(operationId, 'completed', { result });
  }

  sendError(operationId, error) {
    this.sendProgress(operationId, 'error', { 
      error: error.message || error.toString() 
    });
  }
}

module.exports = { NotificationManager };