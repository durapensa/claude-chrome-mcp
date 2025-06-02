// Configuration constants for Claude Chrome MCP Extension

export const WEBSOCKET_PORT = 54321;
export const KEEPALIVE_INTERVAL = 20000;
export const RECONNECT_INTERVAL = 2000;
export const OPERATION_TIMEOUT = 180000; // 3 minutes
export const COMPLETION_TIMEOUT = 600000; // 10 minutes

export const MESSAGE_TYPES = {
  // WebSocket messages
  CONNECTION_REQUEST: 'connection_request',
  PING: 'ping',
  PONG: 'pong',
  CLIENT_CONNECTED: 'client_connected',
  CLIENT_DISCONNECTED: 'client_disconnected',
  CLIENT_LIST_UPDATE: 'client_list_update',
  HUB_HEALTH: 'hub_health',
  OPERATION_UPDATE: 'operation_update',
  
  // Chrome runtime messages  
  MANUAL_INJECT: 'manual_inject_content_script',
  TEST_CSM: 'test_csm',
  REGISTER_OPERATION: 'register_operation'
};

export const OPERATION_TYPES = {
  SEND_MESSAGE: 'send_message',
  GET_RESPONSE: 'get_response',
  FORWARD_RESPONSE: 'forward_response'
};

export const CLAUDE_AI_URL = 'https://claude.ai';