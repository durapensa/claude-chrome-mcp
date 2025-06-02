// Multi-Hub Architecture Manager
// Handles hub election, failover, and coordination between multiple MCP servers

const WebSocket = require('ws');
const EventEmitter = require('events');

class MultiHubManager extends EventEmitter {
  constructor(hubClient) {
    super();
    this.hubClient = hubClient;
    this.isHubManager = false;
    this.knownHubs = new Map(); // serverId -> hubInfo
    this.hubHealthChecks = new Map(); // serverId -> health check interval
    this.DISCOVERY_PORT = 54322; // Hub discovery port (different from main hub port)
    this.HEALTH_CHECK_INTERVAL = 15000; // 15 seconds
    this.HUB_TIMEOUT = 30000; // 30 seconds for hub to be considered dead
    
    this.setupDiscoveryService();
  }

  setupDiscoveryService() {
    // Listen for hub announcements from other servers
    try {
      this.discoveryServer = new WebSocket.Server({ port: this.DISCOVERY_PORT });
      
      this.discoveryServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            this.handleDiscoveryMessage(message, ws);
          } catch (error) {
            console.warn('CCM: Invalid discovery message:', error);
          }
        });
      });
      
      console.error(`CCM: Multi-hub discovery service started on port ${this.DISCOVERY_PORT}`);
    } catch (error) {
      console.warn('CCM: Could not start discovery service:', error.message);
    }
  }

  handleDiscoveryMessage(message, ws) {
    const { type, serverId, hubInfo } = message;
    
    switch (type) {
      case 'hub_announcement':
        this.registerHub(serverId, hubInfo);
        break;
        
      case 'hub_health_check':
        this.respondToHealthCheck(ws, serverId);
        break;
        
      case 'hub_election_request':
        this.handleElectionRequest(message, ws);
        break;
        
      case 'hub_shutdown_notice':
        this.handleHubShutdown(serverId);
        break;
    }
  }

  registerHub(serverId, hubInfo) {
    const existingHub = this.knownHubs.get(serverId);
    
    if (!existingHub) {
      console.error(`CCM: New hub discovered: ${serverId} at ${hubInfo.address}:${hubInfo.port}`);
      this.knownHubs.set(serverId, {
        ...hubInfo,
        lastSeen: Date.now(),
        status: 'active'
      });
      
      this.startHealthMonitoring(serverId);
      this.emit('hub_discovered', serverId, hubInfo);
    } else {
      // Update last seen time
      existingHub.lastSeen = Date.now();
      existingHub.status = 'active';
    }
  }

  startHealthMonitoring(serverId) {
    if (this.hubHealthChecks.has(serverId)) {
      return; // Already monitoring
    }
    
    const healthCheckInterval = setInterval(() => {
      this.checkHubHealth(serverId);
    }, this.HEALTH_CHECK_INTERVAL);
    
    this.hubHealthChecks.set(serverId, healthCheckInterval);
  }

  async checkHubHealth(serverId) {
    const hubInfo = this.knownHubs.get(serverId);
    if (!hubInfo) return;
    
    const timeSinceLastSeen = Date.now() - hubInfo.lastSeen;
    
    if (timeSinceLastSeen > this.HUB_TIMEOUT) {
      console.warn(`CCM: Hub ${serverId} appears to be down (${timeSinceLastSeen}ms since last contact)`);
      this.handleHubFailure(serverId);
    }
  }

  handleHubFailure(serverId) {
    const hubInfo = this.knownHubs.get(serverId);
    if (!hubInfo) return;
    
    console.error(`CCM: Hub ${serverId} failed - initiating failover`);
    
    // Mark hub as failed
    hubInfo.status = 'failed';
    
    // Clear health monitoring
    const healthCheck = this.hubHealthChecks.get(serverId);
    if (healthCheck) {
      clearInterval(healthCheck);
      this.hubHealthChecks.delete(serverId);
    }
    
    this.emit('hub_failed', serverId, hubInfo);
    
    // If this was the current hub, trigger election
    if (this.hubClient.isHubOwner && serverId === this.hubClient.serverId) {
      this.triggerHubElection();
    }
  }

  async triggerHubElection() {
    console.error('CCM: Triggering hub election due to hub failure');
    
    // Basic election algorithm: server with lowest lexicographic ID becomes hub
    const activeServers = Array.from(this.knownHubs.entries())
      .filter(([id, info]) => info.status === 'active')
      .map(([id]) => id)
      .sort();
    
    const myServerId = this.hubClient.clientInfo.id;
    activeServers.push(myServerId);
    activeServers.sort();
    
    const electedServerId = activeServers[0];
    
    if (electedServerId === myServerId) {
      console.error('CCM: I am elected as new hub');
      await this.becomeHub();
    } else {
      console.error(`CCM: Server ${electedServerId} elected as new hub`);
      await this.connectToNewHub(electedServerId);
    }
  }

  async becomeHub() {
    if (this.hubClient.isHubOwner) {
      console.error('CCM: Already hub owner');
      return;
    }
    
    try {
      // Disconnect from current hub if connected as client
      if (this.hubClient.connected && !this.hubClient.isHubOwner) {
        await this.hubClient.disconnect();
      }
      
      // Start new hub
      await this.hubClient.startHubAndConnect();
      
      // Announce new hub to other servers
      this.announceNewHub();
      
      console.error('CCM: Successfully became new hub');
    } catch (error) {
      console.error('CCM: Failed to become hub:', error);
    }
  }

  async connectToNewHub(hubServerId) {
    const hubInfo = this.knownHubs.get(hubServerId);
    if (!hubInfo) {
      console.error(`CCM: Cannot connect to unknown hub ${hubServerId}`);
      return;
    }
    
    try {
      // Disconnect from current hub
      if (this.hubClient.connected) {
        await this.hubClient.disconnect();
      }
      
      // Connect to new hub
      await this.hubClient.connectToExistingHub(5000);
      
      console.error(`CCM: Successfully connected to new hub ${hubServerId}`);
    } catch (error) {
      console.error(`CCM: Failed to connect to new hub ${hubServerId}:`, error);
      // Trigger new election if connection fails
      setTimeout(() => this.triggerHubElection(), 2000);
    }
  }

  announceNewHub() {
    const announcement = {
      type: 'hub_announcement',
      serverId: this.hubClient.clientInfo.id,
      hubInfo: {
        address: 'localhost',
        port: 54321,
        startTime: Date.now(),
        capabilities: this.hubClient.clientInfo.capabilities
      }
    };
    
    this.broadcastToDiscoveryNetwork(announcement);
  }

  broadcastToDiscoveryNetwork(message) {
    // This would broadcast to all known discovery endpoints
    // For now, just log the intent
    console.error('CCM: Broadcasting discovery message:', message.type);
  }

  respondToHealthCheck(ws, serverId) {
    const response = {
      type: 'hub_health_response',
      serverId: this.hubClient.clientInfo.id,
      timestamp: Date.now(),
      status: 'healthy'
    };
    
    try {
      ws.send(JSON.stringify(response));
    } catch (error) {
      console.warn('CCM: Failed to send health response:', error);
    }
  }

  handleElectionRequest(message, ws) {
    // Participate in hub election
    const response = {
      type: 'election_response',
      serverId: this.hubClient.clientInfo.id,
      priority: this.calculateElectionPriority(),
      timestamp: Date.now()
    };
    
    try {
      ws.send(JSON.stringify(response));
    } catch (error) {
      console.warn('CCM: Failed to send election response:', error);
    }
  }

  calculateElectionPriority() {
    // Higher priority = more likely to become hub
    // Factors: uptime, capabilities, load, etc.
    let priority = 100;
    
    // Prefer Claude Code servers
    if (process.env.ANTHROPIC_ENVIRONMENT === 'claude_code') {
      priority += 50;
    }
    
    // Prefer servers with longer uptime
    const uptime = Date.now() - (this.hubClient.connectionHistory[0]?.timestamp || Date.now());
    priority += Math.min(uptime / 60000, 100); // Up to 100 points for uptime
    
    return priority;
  }

  handleHubShutdown(serverId) {
    console.error(`CCM: Hub ${serverId} is shutting down gracefully`);
    this.handleHubFailure(serverId);
  }

  async shutdown() {
    // Announce shutdown to other servers
    const shutdownNotice = {
      type: 'hub_shutdown_notice',
      serverId: this.hubClient.clientInfo.id,
      timestamp: Date.now()
    };
    
    this.broadcastToDiscoveryNetwork(shutdownNotice);
    
    // Clear all health checks
    for (const [serverId, interval] of this.hubHealthChecks) {
      clearInterval(interval);
    }
    this.hubHealthChecks.clear();
    
    // Close discovery server
    if (this.discoveryServer) {
      this.discoveryServer.close();
    }
  }

  getHubStatus() {
    return {
      isHubOwner: this.hubClient.isHubOwner,
      connectedHub: this.hubClient.isHubOwner ? 'self' : 'external',
      knownHubs: this.knownHubs.size,
      activeHubs: Array.from(this.knownHubs.values()).filter(h => h.status === 'active').length,
      lastElection: this.lastElection || null
    };
  }
}

module.exports = { MultiHubManager };