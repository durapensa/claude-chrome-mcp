// Handles MCP notification sending for operation progress and completion
class NotificationManager {
  constructor(server, errorTracker = null) {
    this.server = server;
    this.errorTracker = errorTracker;
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
      if (this.server && typeof this.server.sendNotification === 'function') {
        this.server.sendNotification('operation/progress', notification.params);
        console.log(`[NotificationManager] Successfully sent notification for ${operationId}`);
      } else {
        const errorMsg = 'Server not properly initialized or sendNotification method missing';
        console.error(`[NotificationManager] ${errorMsg}`);
        if (this.errorTracker) {
          this.errorTracker.logError(new Error(errorMsg), { 
            operationId, 
            milestone,
            component: 'NotificationManager' 
          });
        }
        return false;
      }
    } catch (error) {
      console.error('[NotificationManager] Failed to send notification:', error.message);
      console.error('[NotificationManager] Error details:', error);
      
      // Track notification delivery errors
      if (this.errorTracker) {
        this.errorTracker.logError(error, { 
          operationId, 
          milestone, 
          component: 'NotificationManager',
          notificationParams: notification.params 
        });
      }
      return false;
    }
    return true;
  }

  sendCompletion(operationId, result = {}) {
    return this.sendProgress(operationId, 'completed', { result });
  }

  sendError(operationId, error) {
    return this.sendProgress(operationId, 'error', { 
      error: error.message || error.toString() 
    });
  }

  // Test method to verify notification delivery
  testNotificationDelivery() {
    const testId = `test_${Date.now()}`;
    console.log('[NotificationManager] Testing notification delivery...');
    return this.sendProgress(testId, 'test', { 
      message: 'Notification delivery test' 
    });
  }
}

module.exports = { NotificationManager };