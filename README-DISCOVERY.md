# Automated Discovery Framework

## Overview

The Claude Chrome MCP project now includes a comprehensive **Automated Discovery Framework** for continuously monitoring and cataloging changes to Claude.ai's internal APIs and web UI elements. This framework is designed to automatically detect when Anthropic makes changes to the platform and update our knowledge base accordingly.

## Features

### 🔍 API Discovery
- **Automated network traffic analysis** during Claude.ai operations
- **API endpoint discovery** through systematic testing scenarios
- **Change detection** for modified endpoints, parameters, and responses
- **Versioned knowledge base** with historical API evolution
- **Production-ready safety features** with rate limiting and error handling

### 🎨 UI Element Discovery  
- **Systematic DOM element cataloging** with multiple selector strategies
- **Selector reliability testing** to identify the most stable automation patterns
- **UI change detection** for modified elements, attributes, and structure
- **Automated recommendations** for optimal selector usage
- **Cross-version compatibility analysis**

### 📊 Knowledge Base Management
- **Persistent storage** of discovered APIs and UI elements
- **Change tracking** across versions with detailed diff analysis
- **Automated documentation generation** in JSON and Markdown formats
- **Historical versioning** for rollback and trend analysis

## Quick Start

### Run Complete Discovery Suite
```bash
# Run both API and UI discovery
node tests/run-api-discovery.js complete

# Run only API discovery
node tests/run-api-discovery.js api

# Run only UI discovery  
node tests/run-api-discovery.js ui

# Quick test with limited scenarios
node tests/run-api-discovery.js complete --quick
```

### Test the Framework
```bash
# Run comprehensive test suite
node tests/test-discovery-framework.js
```

## Architecture

### Core Components

1. **DiscoveryFramework** (`shared/discovery-framework.js`)
   - Base class with common functionality
   - Knowledge base management
   - Versioning and persistence
   - Report generation

2. **APIDiscovery** (`shared/discovery-framework.js`)
   - Network capture orchestration
   - API endpoint analysis and classification
   - Change detection for API modifications
   - Integration with existing MCP network tools

3. **UIDiscovery** (`shared/ui-discovery-framework.js`)
   - DOM element discovery and cataloging
   - Selector pattern analysis and optimization
   - Reliability testing for automation stability
   - UI change detection and impact analysis

4. **Discovery Scenarios** (`shared/discovery-scenarios.js`)
   - Predefined test scenarios for systematic coverage
   - API workflow patterns (messaging, conversation management, etc.)
   - UI element patterns (inputs, buttons, lists, etc.)
   - Configurable test parameters

### Integration Points

- **Chrome DevTools Protocol**: Direct integration with existing `chrome.debugger` infrastructure
- **MCP Server Tools**: Uses production `start_network_inspection`, `execute_script`, etc.
- **Test Infrastructure**: Builds on existing test harness and client adapters
- **Knowledge Base**: Persistent JSON storage with version tracking

## Discovery Scenarios

### API Discovery Scenarios

1. **Message Sending Workflow**
   - Captures message composition and submission APIs
   - Monitors response generation and streaming endpoints
   - Analyzes real-time communication patterns

2. **Conversation Management Workflow**
   - Discovers conversation listing and search APIs
   - Captures filtering and pagination endpoints
   - Monitors conversation metadata operations

3. **Navigation Workflow**
   - Tracks conversation opening and content loading
   - Captures URL routing and state management
   - Analyzes deep-linking and history APIs

4. **File Upload Workflow**
   - Discovers file attachment and processing APIs
   - Monitors multipart upload endpoints
   - Captures file analysis and integration flows

### UI Discovery Scenarios

1. **Message Interface Elements**
   - Text input areas and composition tools
   - Send buttons and interaction controls
   - Stop buttons and streaming indicators

2. **Conversation List Elements**
   - Navigation lists and conversation items
   - New conversation controls
   - Search and filtering interfaces

3. **Response Elements**
   - Message content containers
   - Code blocks and syntax highlighting
   - Artifacts and interactive previews

4. **Settings and Controls**
   - Model selection interfaces
   - User menus and preferences
   - Configuration and customization options

## Change Detection

### API Changes
- **New endpoints**: Automatically detected and cataloged
- **Parameter changes**: Query params, headers, request body modifications
- **Response format changes**: Structure, field, and type modifications
- **Authentication changes**: Session management and token handling updates

### UI Changes
- **Selector modifications**: data-testid, id, class, and structure changes
- **Element relocations**: Parent/child relationship and positioning changes
- **Attribute changes**: Properties, aria labels, and accessibility updates
- **Visibility changes**: Display states, conditional rendering, and responsiveness

## Output and Reports

### Knowledge Base (`./discovery-data/knowledge-base.json`)
- Complete catalog of discovered APIs and UI elements
- Versioned with timestamps and discovery metadata
- Structured for programmatic access and analysis

### Session Reports (`./discovery-data/reports/`)
- **JSON reports**: Complete session data with all discoveries
- **Markdown summaries**: Human-readable discovery highlights
- **Change logs**: Detailed diff analysis for detected modifications

### Version Snapshots (`./discovery-data/versions/`)
- Point-in-time knowledge base snapshots
- Historical version comparison capability
- Rollback and trend analysis support

## Production Usage

### Continuous Monitoring
```bash
# Daily API discovery (recommended)
0 2 * * * cd /path/to/claude-chrome-mcp && node tests/run-api-discovery.js api

# Weekly UI discovery (UI changes less frequently)
0 3 * * 0 cd /path/to/claude-chrome-mcp && node tests/run-api-discovery.js ui
```

### Change Alerts
The framework can be integrated with monitoring systems to alert when:
- New APIs are discovered (indicating new Claude.ai features)
- Existing APIs change (potential breaking changes)
- UI elements become unreliable (automation may break)
- Selector patterns change (update automation code)

### Integration with Development
```javascript
// Load latest knowledge base in your code
const { DiscoveryFramework } = require('./shared/discovery-framework');
const discovery = new DiscoveryFramework();
await discovery.initialize();

// Get most reliable selector for an element
const messageInput = discovery.knowledgeBase.uiElements.get('message_input');
const bestSelector = messageInput.bestSelector; // e.g., '[data-testid="message-input"]'

// Check if an API endpoint is available
const messageAPI = discovery.knowledgeBase.apis.get('POST:/api/organizations/{id}/chat_conversations/{id}/completion');
const isAvailable = messageAPI && messageAPI.lastSeen > recentThreshold;
```

## Configuration

### Discovery Settings (`shared/discovery-scenarios.js`)
```javascript
const DISCOVERY_CONFIG = {
  api: {
    captureTimeout: 30000,        // 30 seconds per scenario
    requestFilters: ['claude.ai/api'],
    excludePatterns: ['/static/', '.css', '.js']
  },
  ui: {
    searchTimeout: 5000,          // 5 seconds per selector search
    attributesToCapture: ['id', 'class', 'data-testid', 'role'],
    propertiesToCapture: ['textContent', 'value', 'disabled']
  },
  changeDetection: {
    enableVersioning: true,
    enableDiffing: true,
    alertThresholds: {
      newAPIs: 3,                 // Alert if 3+ new APIs discovered
      changedAPIs: 5,             // Alert if 5+ APIs changed
      missingUIElements: 2,       // Alert if 2+ UI elements missing
      changedUIElements: 5        // Alert if 5+ UI elements changed
    }
  }
};
```

## Future Enhancements

### Planned Features
- **Machine learning integration** for pattern prediction
- **Automated test generation** from discovered elements
- **Performance impact analysis** for API changes
- **Visual diff reports** for UI changes
- **Integration with CI/CD** for automated testing
- **Slack/Discord notifications** for critical changes

### Research Areas
- **Behavioral pattern analysis** for user workflow optimization
- **Accessibility compliance** monitoring through discovery
- **Performance regression** detection via API timing analysis
- **Security change detection** for authentication and authorization updates

## Contributing

To extend the discovery framework:

1. **Add new scenarios** in `shared/discovery-scenarios.js`
2. **Enhance analysis** in the discovery framework classes
3. **Improve change detection** with more sophisticated diff algorithms
4. **Add new output formats** for different monitoring systems
5. **Integrate with external tools** for enhanced automation

The framework is designed to be extensible and adaptable to evolving Claude.ai platform changes while maintaining comprehensive coverage of both API and UI surfaces.

---

**Note**: This automated discovery framework ensures that claude-chrome-mcp remains compatible with Claude.ai as Anthropic continues to evolve the platform. Regular discovery runs maintain an up-to-date knowledge base that powers reliable automation and integration.