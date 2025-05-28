export const WEBSOCKET_PORT = 54321;
export const CLAUDE_DOMAIN = 'claude.ai';
export const CLAUDE_URL_PATTERN = 'https://claude.ai/*';

export const MESSAGE_TYPES = {
  DEBUGGER_COMMAND: 'debugger_command',
  DEBUGGER_RESPONSE: 'debugger_response',
  SESSION_UPDATE: 'session_update',
  KEEPALIVE: 'keepalive',
  ERROR: 'error'
} as const;

export const MCP_TOOLS = {
  SPAWN_CLAUDE_TAB: 'spawn_claude_tab',
  GET_CLAUDE_SESSIONS: 'get_claude_sessions',
  SEND_MESSAGE_TO_CLAUDE: 'send_message_to_claude',
  GET_CLAUDE_RESPONSE: 'get_claude_response',
  DEBUG_ATTACH: 'debug_attach',
  NAVIGATE_TAB: 'navigate_tab',
  EXECUTE_SCRIPT: 'execute_script',
  GET_DOM_ELEMENTS: 'get_dom_elements',
  GET_COOKIES: 'get_cookies'
} as const;

export const CHROME_DEBUGGER_COMMANDS = {
  RUNTIME_EVALUATE: 'Runtime.evaluate',
  DOM_GET_DOCUMENT: 'DOM.getDocument',
  NETWORK_ENABLE: 'Network.enable',
  PAGE_NAVIGATE: 'Page.navigate',
  TARGET_CREATE_TARGET: 'Target.createTarget'
} as const;