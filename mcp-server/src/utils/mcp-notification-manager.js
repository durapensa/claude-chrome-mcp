// Handles MCP notification sending for operation progress and completion
const { createLogger } = require('./logger');

class MCPNotificationManager {
  constructor(server, errorTracker = null) {
    this.server = server;
    this.errorTracker = errorTracker;
    this.logger = createLogger('MCPNotificationManager');
  }

  async sendProgress(operationId, milestone, data = {}) {
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
      // McpServer has a 'server' property which is the underlying Server instance
      // Server inherits from Protocol which has the notification() method
      if (this.server && this.server.server && typeof this.server.server.notification === 'function') {
        await this.server.server.notification({
          method: notification.method,
          params: notification.params
        });
        this.logger.info('Successfully sent notification', { operationId });
      } else {
        // Notifications not available or server not properly initialized
        // This is non-critical for debug logging functionality
        this.logger.debug('MCP notification method not available, skipping notification', { 
          operationId, 
          milestone 
        });
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

  async sendCompletion(operationId, result = {}) {
    return await this.sendProgress(operationId, 'completed', { result });
  }

  async sendError(operationId, error) {
    return await this.sendProgress(operationId, 'error', { 
      error: error.message || error.toString() 
    });
  }

  // Test method to verify notification delivery
  async testNotificationDelivery() {
    const testId = `test_${Date.now()}`;
    this.logger.info('Testing notification delivery...');
    return await this.sendProgress(testId, 'test', { 
      message: 'Notification delivery test' 
    });
  }

  // MCP Standard: Send a logging message notification (notifications/message)
  async sendLoggingMessage(level, data, loggerName = null) {
    const notification = {
      method: 'notifications/message',
      params: {
        level,
        data,
        ...(loggerName && { logger: loggerName })
      }
    };

    try {
      if (this.server && this.server.server && typeof this.server.server.sendLoggingMessage === 'function') {
        // Use the built-in sendLoggingMessage method from MCP SDK
        await this.server.server.sendLoggingMessage(notification.params);
        return true;
      } else {
        this.logger.debug('MCP sendLoggingMessage method not available', { level, loggerName });
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to send logging message', error);
      if (this.errorTracker) {
        this.errorTracker.logError(error, { 
          component: 'NotificationManager',
          method: 'sendLoggingMessage',
          level,
          loggerName 
        });
      }
      return false;
    }
  }

  // MCP Standard: Send a progress notification (notifications/progress)
  // Note: This requires a progressToken from the original request
  async sendStandardProgress(progressToken, progress, total = null, message = null) {
    const notification = {
      method: 'notifications/progress', 
      params: {
        progressToken,
        progress,
        ...(total !== null && { total }),
        ...(message && { message })
      }
    };

    try {
      if (this.server && this.server.server && typeof this.server.server.notification === 'function') {
        await this.server.server.notification(notification);
        return true;
      } else {
        this.logger.debug('MCP notification method not available for progress', { progressToken });
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to send standard progress notification', error);
      if (this.errorTracker) {
        this.errorTracker.logError(error, { 
          component: 'NotificationManager',
          method: 'sendStandardProgress',
          progressToken,
          progress 
        });
      }
      return false;
    }
  }
}

module.exports = { MCPNotificationManager };