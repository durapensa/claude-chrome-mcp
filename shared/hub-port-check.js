const net = require('net');

/**
 * Check if a port is in use and can be taken over
 * This helps detect orphaned hub instances
 */
async function checkPortAvailability(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use
          resolve({ available: false, canTakeover: false });
        } else {
          resolve({ available: false, error: err });
        }
      })
      .once('listening', () => {
        // Port is available
        tester.close(() => {
          resolve({ available: true, canTakeover: true });
        });
      })
      .listen(port, '127.0.0.1');
  });
}

/**
 * Try to connect to existing hub and check if it's responsive
 */
async function checkHubResponsive(port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const client = net.createConnection({ port, host: '127.0.0.1' }, () => {
      // Connected, but we need to check if it's a WebSocket hub
      client.write('GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n\r\n');
      
      const timeout = setTimeout(() => {
        client.destroy();
        resolve(false);
      }, timeoutMs);
      
      client.once('data', (data) => {
        clearTimeout(timeout);
        client.destroy();
        // Check if response indicates WebSocket upgrade
        const response = data.toString();
        resolve(response.includes('101') || response.includes('websocket'));
      });
    });
    
    client.once('error', () => {
      resolve(false);
    });
    
    setTimeout(() => {
      client.destroy();
      resolve(false);
    }, timeoutMs);
  });
}

module.exports = {
  checkPortAvailability,
  checkHubResponsive
};