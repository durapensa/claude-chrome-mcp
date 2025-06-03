// Simplified Multi-Hub Manager
// First-come-first-served hub election with automatic failover

const EventEmitter = require('events');

class MultiHubManager extends EventEmitter {
  constructor(hubClient) {
    super();
    this.hubClient = hubClient;
    this.lastElection = null;
    this.hubFailureDetected = false;
    
    console.error('CCM: Simplified multi-hub manager initialized (first-come-first-served)');
  }

  // Simplified hub failure detection - just watch for connection loss
  onHubConnectionLost() {
    if (this.hubFailureDetected) {
      return; // Already handling failover
    }
    
    this.hubFailureDetected = true;
    this.lastElection = Date.now();
    
    console.error('CCM: Hub connection lost - attempting to become new hub');
    
    // Simple first-come-first-served: try to become hub immediately
    this.attemptToBecomeHub();
  }

  async attemptToBecomeHub() {
    try {
      // Disconnect from failed hub
      if (this.hubClient.connected) {
        await this.hubClient.disconnect();
      }
      
      // Try to start new hub (first to bind port 54321 wins)
      await this.hubClient.startHubAndConnect();
      
      console.error('CCM: Successfully became new hub (first-come-first-served)');
      this.hubFailureDetected = false;
      
    } catch (error) {
      console.error('CCM: Failed to become hub (another server likely won):', error.message);
      
      // Another server is probably already the hub, try connecting as client
      setTimeout(() => {
        this.attemptToConnectAsClient();
      }, 2000);
    }
  }

  async attemptToConnectAsClient() {
    try {
      console.error('CCM: Attempting to connect to existing hub as client');
      await this.hubClient.connectToExistingHub(5000);
      
      console.error('CCM: Successfully connected to existing hub as client');
      this.hubFailureDetected = false;
      
    } catch (error) {
      console.error('CCM: Failed to connect as client, will retry:', error.message);
      
      // Retry after delay
      setTimeout(() => {
        this.attemptToBecomeHub();
      }, 5000);
    }
  }

  async shutdown() {
    // Simplified shutdown - no complex coordination needed
    console.error('CCM: Multi-hub manager shutting down');
    this.hubFailureDetected = false;
  }

  getHubStatus() {
    return {
      isHubOwner: this.hubClient.isHubOwner,
      connectedHub: this.hubClient.isHubOwner ? 'self' : 'external',
      knownHubs: 0, // Simplified: no hub discovery
      activeHubs: 0, // Simplified: no hub tracking
      lastElection: this.lastElection || null
    };
  }
}

module.exports = { MultiHubManager };