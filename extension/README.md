# Chrome Extension

Chrome extension for Claude Chrome MCP. Uses native ES6 modules, no build required.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` directory

## Development

Edit source files in `src/` directly. Reload extension in Chrome to see changes.

## Structure

```
extension/
├── src/
│   ├── background.js       # Service worker
│   ├── popup.js           # Popup script
│   ├── modules/           # Core modules
│   └── utils/             # Utilities
├── manifest.json          # Extension manifest
├── popup.html            # Popup UI
└── package.json          # Package info
```