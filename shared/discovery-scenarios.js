/**
 * Discovery Scenarios for Claude.ai API and UI Discovery
 * 
 * Predefined test scenarios for systematic discovery of Claude.ai APIs and UI elements.
 * Each scenario represents a specific user workflow that triggers API calls or UI interactions.
 */

/**
 * API Discovery Scenarios
 * Each scenario defines a sequence of operations to capture network traffic
 */
const API_DISCOVERY_SCENARIOS = [
  {
    name: 'message_sending_workflow',
    description: 'Discover message sending and response generation APIs',
    category: 'messaging',
    operations: [
      {
        type: 'send_message',
        message: 'Hello, this is a test message for API discovery.',
        delay: 1000
      },
      {
        type: 'get_response',
        delay: 3000
      },
      {
        type: 'send_message', 
        message: 'Can you explain quantum computing in simple terms?',
        delay: 1000
      },
      {
        type: 'get_response',
        delay: 5000
      }
    ]
  },

  {
    name: 'conversation_management_workflow',
    description: 'Discover conversation listing, search, and management APIs',
    category: 'conversation_management',
    operations: [
      {
        type: 'get_conversations',
        delay: 1000
      },
      {
        type: 'search_conversations',
        searchCriteria: {
          titleSearch: 'test',
          limit: 10
        },
        delay: 1000
      },
      {
        type: 'search_conversations',
        searchCriteria: {
          createdAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          sortBy: 'updated_at',
          sortOrder: 'desc'
        },
        delay: 1000
      }
    ]
  },

  {
    name: 'conversation_navigation_workflow',
    description: 'Discover conversation opening and content loading APIs',
    category: 'navigation',
    operations: [
      {
        type: 'get_conversations',
        delay: 1000
      },
      {
        type: 'custom_script',
        script: `
          // Get first conversation ID from the page
          const conversations = document.querySelectorAll('[data-testid="conversation-item"]');
          return conversations.length > 0 ? conversations[0].getAttribute('data-conversation-id') : null;
        `,
        delay: 1000
      },
      // Note: This will be dynamically replaced with actual conversation ID
      {
        type: 'open_conversation',
        conversationId: 'DYNAMIC_CONVERSATION_ID',
        delay: 2000
      },
      {
        type: 'custom_script',
        script: `
          // Scroll through conversation to trigger content loading
          const messagesContainer = document.querySelector('[data-testid="messages-container"]');
          if (messagesContainer) {
            messagesContainer.scrollTop = 0;
            setTimeout(() => {
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 1000);
          }
          return { scrolled: true };
        `,
        delay: 3000
      }
    ]
  },

  {
    name: 'file_upload_workflow',
    description: 'Discover file upload and processing APIs',
    category: 'file_operations',
    operations: [
      {
        type: 'custom_script',
        script: `
          // Simulate file upload button click and monitor for API calls
          const fileInput = document.querySelector('input[type="file"]');
          const uploadButton = document.querySelector('[data-testid="upload-button"]');
          
          if (uploadButton) {
            uploadButton.click();
            return { uploadTriggered: true };
          }
          return { uploadTriggered: false, reason: 'No upload button found' };
        `,
        delay: 2000
      },
      {
        type: 'send_message',
        message: 'Please analyze this uploaded file.',
        delay: 1000
      }
    ]
  },

  {
    name: 'conversation_deletion_workflow',
    description: 'Discover conversation deletion and cleanup APIs',
    category: 'conversation_management',
    operations: [
      {
        type: 'get_conversations',
        delay: 1000
      },
      {
        type: 'search_conversations',
        searchCriteria: {
          titleSearch: 'api-discovery-test',
          limit: 5
        },
        delay: 1000
      }
      // Note: Actual deletion would be added dynamically based on test conversations
    ]
  },

  {
    name: 'real_time_streaming_workflow',
    description: 'Discover real-time streaming and WebSocket APIs',
    category: 'streaming',
    operations: [
      {
        type: 'send_message',
        message: 'Write a long story about space exploration with multiple chapters.',
        delay: 1000
      },
      {
        type: 'custom_script',
        script: `
          // Monitor for streaming indicators and stop button
          let streamingData = {
            stopButtonVisible: false,
            responseLength: 0,
            streamingIndicators: []
          };
          
          const checkStreaming = () => {
            const stopButton = document.querySelector('[data-testid="stop-button"]');
            const responseElements = document.querySelectorAll('[data-testid="message-content"]');
            const lastResponse = responseElements[responseElements.length - 1];
            
            streamingData.stopButtonVisible = !!stopButton;
            streamingData.responseLength = lastResponse ? lastResponse.textContent.length : 0;
            
            if (stopButton) {
              streamingData.streamingIndicators.push({
                timestamp: Date.now(),
                responseLength: streamingData.responseLength,
                stopButtonPresent: true
              });
            }
            
            return streamingData;
          };
          
          // Check multiple times during streaming
          const checks = [];
          for (let i = 0; i < 10; i++) {
            setTimeout(() => {
              checks.push(checkStreaming());
            }, i * 1000);
          }
          
          return new Promise(resolve => {
            setTimeout(() => resolve({ streamingChecks: checks }), 10000);
          });
        `,
        delay: 12000
      }
    ]
  },

  {
    name: 'authentication_workflow',
    description: 'Discover authentication and session management APIs',
    category: 'authentication',
    operations: [
      {
        type: 'custom_script',
        script: `
          // Check for authentication-related API calls
          // Look for session validation, token refresh, etc.
          const cookies = document.cookie;
          const sessionData = {
            cookieNames: cookies.split(';').map(c => c.trim().split('=')[0]),
            localStorage: Object.keys(localStorage),
            sessionStorage: Object.keys(sessionStorage)
          };
          return sessionData;
        `,
        delay: 1000
      },
      {
        type: 'get_conversations',
        delay: 1000
      }
    ]
  },

  {
    name: 'ui_interaction_workflow', 
    description: 'Discover APIs triggered by various UI interactions',
    category: 'ui_interactions',
    operations: [
      {
        type: 'custom_script',
        script: `
          // Simulate various UI interactions that might trigger API calls
          const interactions = [];
          
          // Click on different UI elements
          const clickableElements = [
            '[data-testid="new-conversation"]',
            '[data-testid="conversation-settings"]',
            '[data-testid="user-menu"]',
            '[data-testid="model-selector"]'
          ];
          
          for (const selector of clickableElements) {
            const element = document.querySelector(selector);
            if (element) {
              element.click();
              interactions.push({ selector, clicked: true });
              // Small delay between clicks
              await new Promise(resolve => setTimeout(resolve, 500));
            } else {
              interactions.push({ selector, clicked: false, reason: 'Element not found' });
            }
          }
          
          return { interactions };
        `,
        delay: 3000
      }
    ]
  }
];

/**
 * UI Element Discovery Scenarios
 * Each scenario defines patterns to search for UI elements and their properties
 */
const UI_DISCOVERY_SCENARIOS = [
  {
    name: 'message_interface_elements',
    description: 'Discover message input, send button, and conversation elements',
    category: 'messaging_ui',
    selectors: [
      {
        name: 'message_input',
        patterns: [
          'textarea[placeholder*="message"]',
          '[data-testid*="message-input"]',
          '[contenteditable="true"]',
          'textarea[role="textbox"]'
        ],
        attributes: ['placeholder', 'aria-label', 'data-testid', 'id', 'class'],
        properties: ['value', 'disabled', 'required']
      },
      {
        name: 'send_button',
        patterns: [
          '[data-testid*="send"]',
          'button[aria-label*="send"]',
          'button[title*="send"]',
          '[type="submit"]'
        ],
        attributes: ['aria-label', 'data-testid', 'title', 'disabled'],
        properties: ['disabled', 'innerHTML', 'textContent']
      },
      {
        name: 'stop_button',
        patterns: [
          '[data-testid*="stop"]',
          'button[aria-label*="stop"]',
          '[title*="stop"]'
        ],
        attributes: ['aria-label', 'data-testid', 'title'],
        properties: ['disabled', 'style.display', 'textContent']
      }
    ]
  },

  {
    name: 'conversation_list_elements',
    description: 'Discover conversation list, items, and navigation elements',
    category: 'navigation_ui',
    selectors: [
      {
        name: 'conversation_list',
        patterns: [
          '[data-testid*="conversation-list"]',
          '[role="list"]',
          '.conversation-list',
          '[aria-label*="conversation"]'
        ],
        attributes: ['data-testid', 'role', 'aria-label'],
        properties: ['children.length', 'scrollHeight', 'scrollTop']
      },
      {
        name: 'conversation_item',
        patterns: [
          '[data-testid*="conversation-item"]',
          '[role="listitem"]',
          '.conversation-item'
        ],
        attributes: ['data-testid', 'data-conversation-id', 'role'],
        properties: ['textContent', 'classList']
      },
      {
        name: 'new_conversation_button',
        patterns: [
          '[data-testid*="new-conversation"]',
          'button[aria-label*="new conversation"]',
          '[title*="new conversation"]'
        ],
        attributes: ['data-testid', 'aria-label', 'title'],
        properties: ['disabled', 'textContent']
      }
    ]
  },

  {
    name: 'response_elements',
    description: 'Discover response content, artifacts, and formatting elements',
    category: 'content_ui',
    selectors: [
      {
        name: 'message_content',
        patterns: [
          '[data-testid*="message-content"]',
          '[data-testid*="response"]',
          '.message-content',
          '[role="article"]'
        ],
        attributes: ['data-testid', 'role', 'data-message-id'],
        properties: ['textContent', 'innerHTML', 'children.length']
      },
      {
        name: 'code_blocks',
        patterns: [
          'pre code',
          '[data-testid*="code-block"]',
          '.code-block',
          '[class*="highlight"]'
        ],
        attributes: ['data-testid', 'class', 'data-language'],
        properties: ['textContent', 'dataset.language']
      },
      {
        name: 'artifacts',
        patterns: [
          '[data-testid*="artifact"]',
          '[data-testid*="preview"]',
          '.artifact-container'
        ],
        attributes: ['data-testid', 'data-artifact-id', 'data-type'],
        properties: ['textContent', 'dataset']
      }
    ]
  },

  {
    name: 'settings_and_controls',
    description: 'Discover settings, model selection, and control elements',
    category: 'controls_ui',
    selectors: [
      {
        name: 'model_selector',
        patterns: [
          '[data-testid*="model"]',
          'select[aria-label*="model"]',
          '[role="combobox"]'
        ],
        attributes: ['data-testid', 'aria-label', 'role'],
        properties: ['value', 'options.length', 'disabled']
      },
      {
        name: 'settings_menu',
        patterns: [
          '[data-testid*="settings"]',
          '[aria-label*="settings"]',
          '[title*="settings"]'
        ],
        attributes: ['data-testid', 'aria-label', 'title'],
        properties: ['disabled', 'style.display']
      },
      {
        name: 'user_menu',
        patterns: [
          '[data-testid*="user-menu"]',
          '[aria-label*="user"]',
          '.user-menu'
        ],
        attributes: ['data-testid', 'aria-label'],
        properties: ['disabled', 'style.display']
      }
    ]
  }
];

/**
 * Change Detection Patterns
 * Patterns to identify when UI elements or APIs have changed
 */
const CHANGE_DETECTION_PATTERNS = {
  api: {
    newEndpoint: /\/api\/[^\/]+\/[^\/]+/,
    versionChange: /v\d+/,
    parameterChange: ['query', 'body', 'headers'],
    statusCodeChange: [200, 201, 400, 401, 403, 404, 500]
  },
  ui: {
    selectorChange: ['data-testid', 'id', 'class', 'aria-label'],
    structureChange: ['parentElement', 'children', 'nextSibling'],
    propertyChange: ['disabled', 'hidden', 'style.display', 'textContent'],
    attributeChange: ['data-*', 'aria-*', 'role', 'title']
  }
};

/**
 * Discovery Configuration
 */
const DISCOVERY_CONFIG = {
  api: {
    captureTimeout: 30000, // 30 seconds per scenario
    requestFilters: [
      'claude.ai/api',
      'anthropic.com/api'
    ],
    excludePatterns: [
      '/static/',
      '/assets/',
      '.css',
      '.js',
      '.png',
      '.jpg'
    ]
  },
  ui: {
    searchTimeout: 5000, // 5 seconds per selector search
    attributesToCapture: [
      'id', 'class', 'data-testid', 'role', 'aria-label', 'title', 
      'placeholder', 'type', 'disabled', 'hidden'
    ],
    propertiesToCapture: [
      'textContent', 'innerHTML', 'value', 'disabled', 'hidden',
      'offsetWidth', 'offsetHeight', 'style.display'
    ]
  },
  changeDetection: {
    enableVersioning: true,
    enableDiffing: true,
    alertThresholds: {
      newAPIs: 3,
      changedAPIs: 5,
      missingUIElements: 2,
      changedUIElements: 5
    }
  }
};

module.exports = {
  API_DISCOVERY_SCENARIOS,
  UI_DISCOVERY_SCENARIOS,
  CHANGE_DETECTION_PATTERNS,
  DISCOVERY_CONFIG
};