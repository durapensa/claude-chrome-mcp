// MCP Client representation for connected clients

export class MCPRelayClient {
  constructor(ws, clientInfo) {
    this.id = clientInfo.id || `client-${Date.now()}`;
    this.name = clientInfo.name || 'Unknown Client';
    this.capabilities = clientInfo.capabilities || [];
    this.metadata = clientInfo.metadata || {};
    this.ws = ws;
    this.connectedAt = Date.now();
    this.lastPing = Date.now();
    this.messageCount = 0;
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      this.messageCount++;
      return true;
    }
    return false;
  }

  updatePing() {
    this.lastPing = Date.now();
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      capabilities: this.capabilities,
      metadata: this.metadata,
      connectedAt: this.connectedAt,
      lastPing: this.lastPing,
      messageCount: this.messageCount,
      connectionDuration: Date.now() - this.connectedAt
    };
  }

  isAlive() {
    // Consider client alive if pinged within last 60 seconds
    return (Date.now() - this.lastPing) < 60000;
  }
}