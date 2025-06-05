// Handles MCP notification sending for operation progress and completion
const { createLogger } = require('./logger');

class NotificationManager {
  constructor(server, errorTracker = null) {
    this.server = server;
    this.errorTracker = errorTracker;
    this.logger = createLogger('NotificationManager');
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
    
    this.logger.info('Sending progress', { operationId, milestone });
    
    try {
      if (this.server && typeof this.server.sendNotification === 'function') {
        this.server.sendNotification('operation/progress', notification.params);
        this.logger.info('Successfully sent notification', { operationId });
      } else {
        const errorMsg = 'Server not properly initialized or sendNotification method missing';
        this.logger.error(errorMsg);
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
      this.logger.error('Failed to send notification', error);
      // Error details already logged above
      
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
    this.logger.info('Testing notification delivery...');
    return this.sendProgress(testId, 'test', { 
      message: 'Notification delivery test' 
    });
  }
}

module.exports = { NotificationManager };