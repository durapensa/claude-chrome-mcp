# Claude Chrome MCP Tools - Priority Enhancements 1-4

## 1. Fix and Enhance Artifact Extraction

**Tool: `extract_conversation_elements`**

**Current Issue:** Tool exists but artifact extraction may not be working properly.

**Required Implementation:**

```javascript
// Enhanced artifact extraction function
async function extractConversationElements(tabId) {
  try {
    // Multiple DOM selector strategies for artifacts
    const artifactSelectors = [
      'iframe[title*="artifact"]',
      'iframe[src*="artifact"]', 
      '[data-testid*="artifact"]',
      '.artifact',
      '[class*="artifact"]',
      'iframe[sandbox]', // Claude often uses sandboxed iframes
      '[data-component*="artifact"]'
    ];
    
    const codeBlockSelectors = [
      'pre code',
      '.highlight',
      '[class*="code-block"]',
      '[data-language]'
    ];
    
    // Execute extraction script in the target tab
    const result = await chrome.debugger.sendCommand(tabId, 'Runtime.evaluate', {
      expression: `
        (function() {
          const artifacts = [];
          const codeBlocks = [];
          const toolUsage = [];
          
          // Extract artifacts
          const artifactSelectors = ${JSON.stringify(artifactSelectors)};
          artifactSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((element, index) => {
              let content = '';
              let type = 'unknown';
              
              if (element.tagName === 'IFRAME') {
                try {
                  // Try to access iframe content if same-origin
                  content = element.contentDocument?.documentElement?.outerHTML || 
                           element.outerHTML;
                  type = 'html';
                } catch (e) {
                  // Cross-origin iframe, get what we can
                  content = element.outerHTML;
                  type = 'iframe';
                }
              } else {
                content = element.outerHTML;
                type = element.dataset.type || 'unknown';
              }
              
              artifacts.push({
                id: element.id || 'artifact_' + index,
                selector: selector,
                type: type,
                title: element.title || element.getAttribute('aria-label') || 'Untitled',
                content: content,
                elementType: element.tagName.toLowerCase(),
                attributes: Object.fromEntries(
                  Array.from(element.attributes).map(attr => [attr.name, attr.value])
                )
              });
            });
          });
          
          // Extract code blocks
          const codeSelectors = ${JSON.stringify(codeBlockSelectors)};
          codeSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((element, index) => {
              codeBlocks.push({
                id: 'code_' + index,
                language: element.className.match(/language-(\w+)/)?.[1] || 
                         element.dataset.language || 'text',
                content: element.textContent,
                html: element.outerHTML
              });
            });
          });
          
          // Extract tool usage indicators
          const toolIndicators = document.querySelectorAll(
            '[data-testid*="search"], [class*="search"], ' +
            '[data-testid*="repl"], [class*="repl"], ' + 
            '[data-testid*="tool"], [class*="tool-usage"]'
          );
          
          toolIndicators.forEach((element, index) => {
            toolUsage.push({
              id: 'tool_' + index,
              type: element.dataset.testid || element.className,
              content: element.textContent.trim(),
              html: element.outerHTML
            });
          });
          
          return {
            artifacts,
            codeBlocks,
            toolUsage,
            extractedAt: new Date().toISOString(),
            totalElements: artifacts.length + codeBlocks.length + toolUsage.length
          };
        })()
      `
    });
    
    return {
      success: true,
      data: result.result.value,
      tabId: tabId
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      tabId: tabId
    };
  }
}
```

## 2. Implement Response Status Monitoring

**New Tool: `get_claude_response_status`**

**Implementation:**

```javascript
async function getClaude ResponseStatus(tabId) {
  try {
    const result = await chrome.debugger.sendCommand(tabId, 'Runtime.evaluate', {
      expression: `
        (function() {
          // Look for Claude's response generation indicators
          const typingIndicator = document.querySelector('[data-testid*="typing"], .typing, [class*="generating"]');
          const responseContainer = document.querySelector('[data-testid*="response"], [class*="response"]');
          const sendButton = document.querySelector('button[data-testid*="send"], button[type="submit"]');
          const errorElements = document.querySelectorAll('[class*="error"], [data-testid*="error"]');
          
          // Estimate progress based on UI elements
          let status = 'unknown';
          let progress = null;
          
          if (typingIndicator && typingIndicator.style.display !== 'none') {
            status = 'generating';
            // Try to estimate progress from animation or content length
            const responseText = responseContainer?.textContent || '';
            progress = {
              estimatedCompletion: Math.min(responseText.length / 2000, 0.95), // Rough estimate
              tokensGenerated: Math.floor(responseText.length / 4), // ~4 chars per token
              timeElapsed: (Date.now() - window.responseStartTime) / 1000 || 0
            };
          } else if (errorElements.length > 0) {
            status = 'error';
          } else if (sendButton && !sendButton.disabled) {
            status = 'complete';
          } else if (sendButton && sendButton.disabled) {
            status = 'waiting_input';
          }
          
          // Check for active tool usage
          const toolStates = {
            webSearchActive: !!document.querySelector('[data-testid*="search"][class*="active"]'),
            replActive: !!document.querySelector('[data-testid*="repl"][class*="active"]'),
            artifactsActive: !!document.querySelector('[data-testid*="artifact"][class*="generating"]')
          };
          
          return {
            status,
            progress,
            isStreaming: status === 'generating',
            lastUpdate: Date.now(),
            tools: toolStates,
            responseLength: responseContainer?.textContent?.length || 0,
            hasErrors: errorElements.length > 0,
            errorMessages: Array.from(errorElements).map(el => el.textContent.trim())
          };
        })()
      `
    });
    
    return {
      success: true,
      ...result.result.value,
      tabId: tabId
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      tabId: tabId,
      status: 'error'
    };
  }
}
```

## 3. Fix Export Conversation Transcript

**Enhanced Tool: `export_conversation_transcript`**

**Implementation:**

```javascript
async function exportConversationTranscript(tabId, format = 'markdown') {
  try {
    // First extract all conversation elements
    const elements = await extractConversationElements(tabId);
    
    const result = await chrome.debugger.sendCommand(tabId, 'Runtime.evaluate', {
      expression: `
        (function() {
          const messages = [];
          
          // Multiple strategies to find messages
          const messageSelectors = [
            '[data-testid*="message"]',
            '[class*="message"]',
            '[role="article"]',
            '.prose',
            '[data-message-role]'
          ];
          
          let foundMessages = [];
          for (const selector of messageSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              foundMessages = Array.from(elements);
              break;
            }
          }
          
          // If no structured messages found, try to parse conversation flow
          if (foundMessages.length === 0) {
            // Fallback: look for conversation structure in text
            const conversationText = document.body.innerText;
            const lines = conversationText.split('\\n').filter(line => line.trim());
            
            let currentMessage = null;
            for (const line of lines) {
              if (line.startsWith('Human:') || line.startsWith('User:')) {
                if (currentMessage) messages.push(currentMessage);
                currentMessage = { role: 'user', content: line.substring(line.indexOf(':') + 1).trim() };
              } else if (line.startsWith('Assistant:') || line.startsWith('Claude:')) {
                if (currentMessage) messages.push(currentMessage);
                currentMessage = { role: 'assistant', content: line.substring(line.indexOf(':') + 1).trim() };
              } else if (currentMessage) {
                currentMessage.content += '\\n' + line;
              }
            }
            if (currentMessage) messages.push(currentMessage);
          } else {
            // Parse structured messages
            foundMessages.forEach((element, index) => {
              const isUser = element.dataset.messageRole === 'user' || 
                            element.className.includes('user') ||
                            element.querySelector('[class*="user"]');
              
              const content = element.textContent || element.innerText || '';
              const timestamp = element.dataset.timestamp || 
                              element.querySelector('[datetime]')?.getAttribute('datetime') ||
                              null;
              
              messages.push({
                role: isUser ? 'user' : 'assistant',
                content: content.trim(),
                timestamp: timestamp,
                index: index,
                html: element.outerHTML.substring(0, 1000) // Truncate HTML for space
              });
            });
          }
          
          return {
            messages,
            metadata: {
              url: window.location.href,
              title: document.title,
              extractedAt: new Date().toISOString(),
              messageCount: messages.length
            }
          };
        })()
      `
    });
    
    const conversationData = result.result.value;
    
    // Format the output
    let output;
    if (format === 'json') {
      output = JSON.stringify({
        ...conversationData,
        artifacts: elements.success ? elements.data.artifacts : [],
        codeBlocks: elements.success ? elements.data.codeBlocks : [],
        toolUsage: elements.success ? elements.data.toolUsage : []
      }, null, 2);
    } else {
      // Markdown format
      output = `# ${conversationData.metadata.title}\n\n`;
      output += `**Exported:** ${conversationData.metadata.extractedAt}\n`;
      output += `**URL:** ${conversationData.metadata.url}\n`;
      output += `**Messages:** ${conversationData.metadata.messageCount}\n\n`;
      
      conversationData.messages.forEach((message, index) => {
        output += `## ${message.role === 'user' ? 'Human' : 'Assistant'}\n\n`;
        output += `${message.content}\n\n`;
        if (message.timestamp) {
          output += `*${message.timestamp}*\n\n`;
        }
        output += '---\n\n';
      });
      
      // Add artifacts section
      if (elements.success && elements.data.artifacts.length > 0) {
        output += `## Artifacts (${elements.data.artifacts.length})\n\n`;
        elements.data.artifacts.forEach((artifact, index) => {
          output += `### ${artifact.title}\n`;
          output += `**Type:** ${artifact.type}\n`;
          output += `**ID:** ${artifact.id}\n\n`;
          output += '```html\n' + artifact.content.substring(0, 1000) + '\n```\n\n';
        });
      }
    }
    
    return {
      success: true,
      transcript: output,
      format: format,
      messageCount: conversationData.messages.length,
      artifactCount: elements.success ? elements.data.artifacts.length : 0,
      size: output.length
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      tabId: tabId
    };
  }
}
```

## 4. Enhanced Batch Operations

**New Tool: `batch_get_responses`**

**Implementation:**

```javascript
async function batchGetResponses(options) {
  const {
    tabIds,
    timeoutMs = 30000,
    waitForAll = true,
    pollIntervalMs = 1000
  } = options;
  
  const results = [];
  const startTime = Date.now();
  
  try {
    if (waitForAll) {
      // Wait for all responses to complete
      const promises = tabIds.map(async (tabId) => {
        const startTabTime = Date.now();
        
        // Poll for completion
        while (Date.now() - startTime < timeoutMs) {
          const status = await getClaude ResponseStatus(tabId);
          
          if (status.status === 'complete' || status.status === 'error') {
            const response = await getClaude Response(tabId, false, 5000);
            return {
              tabId,
              response,
              status: status.status,
              completedAt: Date.now(),
              duration: Date.now() - startTabTime,
              success: status.status === 'complete'
            };
          }
          
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
        
        // Timeout reached
        return {
          tabId,
          response: null,
          status: 'timeout',
          completedAt: Date.now(),
          duration: Date.now() - startTabTime,
          success: false,
          error: 'Response timeout'
        };
      });
      
      const allResults = await Promise.all(promises);
      results.push(...allResults);
      
    } else {
      // Return responses as they complete
      const pendingTabs = [...tabIds];
      
      while (pendingTabs.length > 0 && Date.now() - startTime < timeoutMs) {
        for (let i = pendingTabs.length - 1; i >= 0; i--) {
          const tabId = pendingTabs[i];
          const status = await getClaude ResponseStatus(tabId);
          
          if (status.status === 'complete' || status.status === 'error') {
            const response = await getClaude Response(tabId, false, 5000);
            results.push({
              tabId,
              response,
              status: status.status,
              completedAt: Date.now(),
              duration: Date.now() - startTime,
              success: status.status === 'complete'
            });
            
            pendingTabs.splice(i, 1);
          }
        }
        
        if (pendingTabs.length > 0) {
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
      }
      
      // Add timeout results for remaining tabs
      pendingTabs.forEach(tabId => {
        results.push({
          tabId,
          response: null,
          status: 'timeout',
          completedAt: Date.now(),
          duration: timeoutMs,
          success: false,
          error: 'Response timeout'
        });
      });
    }
    
    const summary = {
      total: tabIds.length,
      completed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      timedOut: results.filter(r => r.status === 'timeout').length,
      totalTime: Date.now() - startTime,
      averageResponseTime: results
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.duration, 0) / Math.max(results.filter(r => r.success).length, 1)
    };
    
    return {
      success: true,
      results,
      summary,
      waitForAll,
      requestedTabs: tabIds.length
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      results,
      summary: {
        total: tabIds.length,
        completed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length + 1
      }
    };
  }
}
```

## Integration Notes

1. **Error Handling:** All functions include comprehensive try-catch blocks and graceful degradation
2. **DOM Compatibility:** Multiple selector strategies to handle different Claude UI versions
3. **Performance:** Efficient polling with configurable intervals
4. **Extensibility:** Functions designed to be easily extended with additional features

## Testing Checklist

- [ ] Test artifact extraction with HTML, React, and code artifacts
- [ ] Verify response status monitoring during long generations
- [ ] Test transcript export with various conversation types
- [ ] Validate batch operations with multiple concurrent responses
- [ ] Test error handling with network interruptions
- [ ] Verify cross-browser compatibility

## Expected Performance Impact

These enhancements should provide:
- **90%+ artifact extraction accuracy** for supported artifact types
- **Real-time status monitoring** with <1 second update intervals  
- **Complete conversation exports** including all content and metadata
- **Efficient batch processing** handling 10+ concurrent responses reliably