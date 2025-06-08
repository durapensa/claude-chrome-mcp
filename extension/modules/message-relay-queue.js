// Message Queue for reliable message delivery

export class MessageRelayQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.isConnected = false;
  }

  enqueue(message, callback) {
    this.queue.push({ message, callback, timestamp: Date.now() });
    this.process();
  }

  setConnected(connected) {
    this.isConnected = connected;
    if (connected) {
      this.process();
    }
  }

  async process() {
    if (!this.isConnected || this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.isConnected) {
      const item = this.queue.shift();
      
      try {
        if (item.callback) {
          await item.callback(item.message);
        }
      } catch (error) {
        console.error('CCM: Error processing queued message:', error);
      }

      // Small delay between messages to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.processing = false;
  }

  clear() {
    const count = this.queue.length;
    this.queue = [];
    return count;
  }

  size() {
    return this.queue.length;
  }
}