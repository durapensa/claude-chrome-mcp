// Conversation Operations for Chrome Extension
// Methods for managing Claude conversations, metadata, and transcripts

export const conversationOperationMethods = {
  async getClaudeConversations() {
    try {
      // First get current Claude tabs to match with conversations
      const claudeTabsResult = await this.getClaudeTabs();
      const claudeTabs = claudeTabsResult.tabs || [];
      const tabsByConversationId = new Map();
      
      claudeTabs.forEach(tab => {
        // Extract conversation ID from URL if available
        const urlMatch = tab.url?.match(/\/chat\/([a-f0-9-]+)/);
        if (urlMatch) {
          tabsByConversationId.set(urlMatch[1], tab.id);
        }
      });

      // Find a Claude tab to execute the API call from
      let claudeTab = claudeTabs.find(tab => tab.url?.includes('claude.ai'));
      
      if (!claudeTab) {
        // Create a temporary Claude tab for the API call
        claudeTab = await this.createClaudeTab();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page load
      }

      // Attach debugger to execute script
      await this.ensureDebuggerAttached(claudeTab.id);

      // Execute script to fetch conversations from Claude API
      const conversationsScript = `
        (async function() {
          try {
            // Extract organization ID from cookies
            const cookies = document.cookie;
            const orgMatch = cookies.match(/lastActiveOrg=([^;]+)/);
            if (!orgMatch) {
              throw new Error('Organization ID not found in cookies');
            }
            const orgId = orgMatch[1];
            
            const response = await fetch('/api/organizations/' + orgId + '/chat_conversations?offset=0&limit=30', {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              credentials: 'include'
            });
            
            if (!response.ok) {
              throw new Error('Failed to fetch conversations: ' + response.status);
            }
            
            const data = await response.json();
            return data;
          } catch (error) {
            return { error: error.toString() };
          }
        })()
      `;

      const result = await this.executeScript({ 
        tabId: claudeTab.id, 
        script: conversationsScript 
      });

      const apiData = result.result?.value;
      
      if (apiData?.error) {
        throw new Error('API Error: ' + apiData.error);
      }

      if (!apiData || !Array.isArray(apiData)) {
        throw new Error('Invalid API response format');
      }

      // Transform the conversations to include tab IDs
      const conversations = apiData.map(conv => ({
        id: conv.uuid,
        title: conv.name || 'Untitled Conversation',
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        message_count: conv.chat_messages?.length || 0,
        tabId: tabsByConversationId.get(conv.uuid) || null,
        isOpen: tabsByConversationId.has(conv.uuid)
      }));

      return conversations;

    } catch (error) {
      console.error('CCM Extension: Error fetching conversations:', error);
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }
  },

  async exportConversationTranscript(params) {
    const { tabId, format = 'markdown' } = params;
    
    try {
      // First extract conversation elements using our new tool
      const elements = await this.extractConversationElements({ tabId });
      
      await this.ensureDebuggerAttached(tabId);
      
      // Simpler script focused on message extraction
      const messageScript = `
        (function() {
          const messages = [];
          const metadata = {
            url: window.location.href,
            title: document.title,
            exportedAt: new Date().toISOString(),
            conversationId: null
          };
          
          // Extract conversation ID
          const urlMatch = window.location.pathname.match(/\\/chat\\/([a-f0-9-]+)/);
          if (urlMatch) {
            metadata.conversationId = urlMatch[1];
          }
          
          // Multiple strategies to find messages
          const messageSelectors = [
            '[data-testid="user-message"]',
            '.font-claude-message',
            '[data-message-role]',
            '.prose'
          ];
          
          // Collect all potential message elements
          const messageElements = new Set();
          messageSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => messageElements.add(el));
          });
          
          // Convert to array and sort by DOM position
          const sortedMessages = Array.from(messageElements).sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            return 0;
          });
          
          // Process messages
          sortedMessages.forEach((el, index) => {
            const text = el.textContent || el.innerText || '';
            if (!text.trim()) return;
            
            // Determine role
            const isUser = el.getAttribute('data-testid') === 'user-message' ||
                          el.getAttribute('data-message-role') === 'user' ||
                          el.className.includes('user');
            
            messages.push({
              index,
              role: isUser ? 'user' : 'assistant',
              content: text.trim(),
              length: text.length
            });
          });
          
          return {
            metadata,
            messages,
            messageCount: messages.length
          };
        })()
      `;
      
      const messageResult = await this.executeScript({ tabId, script: messageScript });
      const messageData = messageResult.result?.value || { messages: [], metadata: {} };
      
      // Extract artifacts and code blocks
      const artifactsScript = `
        (function() {
          const artifacts = [];
          const codeBlocks = [];
          
          // Find artifacts - Claude uses various selectors for artifacts
          const artifactSelectors = [
            '[data-testid*="artifact"]',
            '.artifact-container',
            '[class*="artifact"]',
            '[data-component="artifact"]',
            'iframe[src*="artifacts"]'
          ];
          
          artifactSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((element, index) => {
              const artifactData = {
                id: element.id || \`artifact-\${artifacts.length + 1}\`,
                type: element.getAttribute('data-type') || 'unknown',
                title: element.getAttribute('data-title') || element.querySelector('h1, h2, h3, .title')?.textContent || \`Artifact \${artifacts.length + 1}\`,
                content: element.textContent || element.innerHTML || '',
                selector: selector,
                elementIndex: index
              };
              
              // Try to determine artifact type from content or attributes
              if (!artifactData.type || artifactData.type === 'unknown') {
                if (artifactData.content.includes('function') || artifactData.content.includes('const ') || artifactData.content.includes('let ')) {
                  artifactData.type = 'code';
                } else if (artifactData.content.includes('<html') || artifactData.content.includes('<!DOCTYPE')) {
                  artifactData.type = 'html';
                } else if (artifactData.content.includes('import ') || artifactData.content.includes('export ')) {
                  artifactData.type = 'javascript';
                } else {
                  artifactData.type = 'text';
                }
              }
              
              artifacts.push(artifactData);
            });
          });
          
          // Find code blocks - look for various code block patterns
          const codeSelectors = [
            'pre code',
            'pre',
            '.code-block',
            '[data-testid*="code"]',
            '.highlight',
            '.hljs'
          ];
          
          codeSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((element, index) => {
              // Skip if this element is already part of an artifact
              if (element.closest('[data-testid*="artifact"], .artifact-container, [class*="artifact"]')) {
                return;
              }
              
              const codeText = element.textContent || '';
              if (codeText.trim().length === 0) return;
              
              // Determine language from class names or content
              let language = 'text';
              const classNames = element.className || '';
              const languageMatch = classNames.match(/language-(\w+)|hljs-(\w+)|(\w+)-code/);
              if (languageMatch) {
                language = languageMatch[1] || languageMatch[2] || languageMatch[3];
              } else {
                // Try to detect language from content
                if (codeText.includes('function') || codeText.includes('=>')) {
                  language = 'javascript';
                } else if (codeText.includes('def ') || codeText.includes('import ')) {
                  language = 'python';
                } else if (codeText.includes('#include') || codeText.includes('int main')) {
                  language = 'c';
                } else if (codeText.includes('<!DOCTYPE') || codeText.includes('<html')) {
                  language = 'html';
                } else if (codeText.includes('SELECT') || codeText.includes('FROM')) {
                  language = 'sql';
                }
              }
              
              const codeData = {
                id: \`code-block-\${codeBlocks.length + 1}\`,
                language: language,
                content: codeText.trim(),
                lineCount: codeText.trim().split('\\n').length,
                characterCount: codeText.length,
                selector: selector,
                elementIndex: index,
                hasLineNumbers: !!element.querySelector('.line-number, .line-numbers'),
                parentMessage: null // Will be determined by position
              };
              
              // Try to find the parent message
              const messageParent = element.closest('[data-testid="user-message"], .font-claude-message, [data-message-role]');
              if (messageParent) {
                const isUser = messageParent.getAttribute('data-testid') === 'user-message' ||
                              messageParent.getAttribute('data-message-role') === 'user';
                codeData.parentMessage = isUser ? 'user' : 'assistant';
              }
              
              codeBlocks.push(codeData);
            });
          });
          
          return {
            artifacts: artifacts,
            codeBlocks: codeBlocks,
            artifactCount: artifacts.length,
            codeBlockCount: codeBlocks.length
          };
        })()
      `;
      
      const artifactsResult = await this.executeScript({ tabId, script: artifactsScript });
      const artifactsData = artifactsResult.result?.value || { artifacts: [], codeBlocks: [], artifactCount: 0, codeBlockCount: 0 };
      
      // Calculate statistics
      const statistics = {
        totalMessages: messageData.messages.length,
        userMessages: messageData.messages.filter(m => m.role === 'user').length,
        assistantMessages: messageData.messages.filter(m => m.role === 'assistant').length,
        totalCharacters: messageData.messages.reduce((sum, m) => sum + m.length, 0),
        estimatedTokens: Math.round(messageData.messages.reduce((sum, m) => sum + m.length, 0) / 4),
        artifactCount: artifactsData.artifactCount,
        codeBlockCount: artifactsData.codeBlockCount,
        totalCodeLines: artifactsData.codeBlocks.reduce((sum, cb) => sum + cb.lineCount, 0),
        languages: [...new Set(artifactsData.codeBlocks.map(cb => cb.language))]
      };
      
      // Format output
      if (format === 'markdown') {
        let markdown = `# ${messageData.metadata.title}\n\n`;
        markdown += `**Exported:** ${messageData.metadata.exportedAt}\n`;
        markdown += `**URL:** ${messageData.metadata.url}\n`;
        if (messageData.metadata.conversationId) {
          markdown += `**Conversation ID:** ${messageData.metadata.conversationId}\n`;
        }
        markdown += `**Messages:** ${statistics.totalMessages} (${statistics.userMessages} user, ${statistics.assistantMessages} assistant)\n`;
        markdown += `**Estimated Tokens:** ${statistics.estimatedTokens}\n`;
        if (statistics.artifactCount > 0) {
          markdown += `**Artifacts:** ${statistics.artifactCount}\n`;
        }
        if (statistics.codeBlockCount > 0) {
          markdown += `**Code Blocks:** ${statistics.codeBlockCount}\n`;
        }
        if (statistics.totalCodeLines > 0) {
          markdown += `**Total Code Lines:** ${statistics.totalCodeLines}\n`;
        }
        if (statistics.languages.length > 0) {
          markdown += `**Languages:** ${statistics.languages.join(', ')}\n`;
        }
        markdown += `\n---\n\n`;
        
        // Add messages
        messageData.messages.forEach(msg => {
          markdown += `## ${msg.role === 'user' ? 'Human' : 'Assistant'}\n\n`;
          markdown += `${msg.content}\n\n`;
          markdown += `---\n\n`;
        });
        
        // Add artifacts section if any exist
        if (artifactsData.artifacts.length > 0) {
          markdown += `## Artifacts\n\n`;
          artifactsData.artifacts.forEach((artifact, index) => {
            markdown += `### Artifact ${index + 1}: ${artifact.title}\n\n`;
            markdown += `**Type:** ${artifact.type}\n`;
            markdown += `**ID:** ${artifact.id}\n\n`;
            if (artifact.content) {
              markdown += `\`\`\`${artifact.type === 'code' ? 'javascript' : artifact.type}\n`;
              markdown += `${artifact.content.substring(0, 2000)}${artifact.content.length > 2000 ? '\n... (truncated)' : ''}\n`;
              markdown += `\`\`\`\n\n`;
            }
            markdown += `---\n\n`;
          });
        }
        
        // Add code blocks section if any exist
        if (artifactsData.codeBlocks.length > 0) {
          markdown += `## Code Blocks\n\n`;
          artifactsData.codeBlocks.forEach((codeBlock, index) => {
            markdown += `### Code Block ${index + 1}\n\n`;
            markdown += `**Language:** ${codeBlock.language}\n`;
            markdown += `**Lines:** ${codeBlock.lineCount}\n`;
            markdown += `**Characters:** ${codeBlock.characterCount}\n`;
            if (codeBlock.parentMessage) {
              markdown += `**From:** ${codeBlock.parentMessage === 'user' ? 'Human' : 'Assistant'}\n`;
            }
            markdown += `\n\`\`\`${codeBlock.language}\n`;
            markdown += `${codeBlock.content}\n`;
            markdown += `\`\`\`\n\n`;
            markdown += `---\n\n`;
          });
        }
        
        return {
          success: true,
          format: 'markdown',
          content: markdown,
          metadata: messageData.metadata,
          statistics: statistics
        };
        
      } else {
        // JSON format
        return {
          success: true,
          format: 'json',
          content: {
            metadata: messageData.metadata,
            messages: messageData.messages,
            artifacts: artifactsData.artifacts,
            codeBlocks: artifactsData.codeBlocks,
            statistics: statistics
          },
          metadata: messageData.metadata,
          statistics: statistics
        };
      }
      
    } catch (error) {
      return { 
        success: false, 
        reason: 'Error exporting transcript', 
        error: error.message 
      };
    }
  },

  async getConversationMetadata(params) {
    const { conversationId, includeMessages = false } = params;
    
    // If conversationId provided, find or open the tab
    let tabId;
    if (conversationId) {
      // First check if conversation is already open
      const tabs = await this.getClaudeTabs();
      const existingTab = tabs.tabs?.find(tab => tab.url?.includes(`/chat/${conversationId}`));
      
      if (existingTab) {
        tabId = existingTab.id;
      } else {
        // Open the conversation
        const openResult = await this.openClaudeConversationTab({ conversationId });
        if (!openResult.success) {
          return { success: false, error: `Failed to open conversation: ${openResult.error}` };
        }
        tabId = openResult.tabId;
      }
    } else {
      return { success: false, error: 'conversationId is required' };
    }
    
    const script = `
      (function() {
        try {
          const metadata = {
            url: window.location.href,
            title: document.title,
            conversationId: null,
            messageCount: 0,
            messages: [],
            lastActivity: null,
            hasArtifacts: false,
            artifactCount: 0,
            features: {
              hasCodeBlocks: false,
              hasImages: false,
              hasTables: false,
              hasLists: false
            }
          };
          
          // Extract conversation ID from URL
          const urlMatch = window.location.pathname.match(/\\/chat\\/([a-f0-9-]+)/);
          if (urlMatch) {
            metadata.conversationId = urlMatch[1];
          }
          
          // Count messages
          const userMessages = document.querySelectorAll('[data-testid="user-message"]');
          const assistantMessages = document.querySelectorAll('.font-claude-message:not([data-testid="user-message"])');
          metadata.messageCount = userMessages.length + assistantMessages.length;
          
          // Check for artifacts
          const artifacts = document.querySelectorAll('[data-testid*="artifact"], .artifact-container, [class*="artifact"]');
          metadata.hasArtifacts = artifacts.length > 0;
          metadata.artifactCount = artifacts.length;
          
          // Analyze content features
          const allContent = document.querySelector('main')?.textContent || '';
          metadata.features.hasCodeBlocks = !!document.querySelector('pre, code, .code-block');
          metadata.features.hasImages = !!document.querySelector('img, [data-testid*="image"]');
          metadata.features.hasTables = !!document.querySelector('table');
          metadata.features.hasLists = !!document.querySelector('ul, ol');
          
          // Get all messages for token counting
          const allMessages = [...userMessages, ...assistantMessages].sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            return 0;
          });
          
          // Get token count estimation (rough estimate: ~4 chars per token)
          const totalChars = Array.from(allMessages).reduce((sum, el) => sum + (el.textContent?.length || 0), 0);
          metadata.estimatedTokens = Math.round(totalChars / 4);
          
          // Get messages if requested
          if (${includeMessages}) {
            metadata.messages = allMessages.map((el, index) => {
              const isUser = el.getAttribute('data-testid') === 'user-message';
              const text = el.textContent || '';
              
              // Check if this message has special content
              const hasCode = !!el.querySelector('pre, code');
              const hasArtifact = !!el.closest('[class*="artifact"]');
              
              return {
                index,
                type: isUser ? 'user' : 'assistant',
                textLength: text.length,
                textPreview: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
                hasCode,
                hasArtifact,
                timestamp: null // Would need to extract from DOM if available
              };
            });
            
            // Last activity approximation
            if (metadata.messages.length > 0) {
              metadata.lastActivity = Date.now(); // Approximate
            }
          }
          
          // Check conversation state
          const inputField = document.querySelector('div[contenteditable="true"]');
          metadata.isActive = !!inputField && !inputField.disabled;
          
          return metadata;
        } catch (error) {
          return { success: false, reason: 'Error getting metadata: ' + error.toString() };
        }
      })()
    `;
    
    const result = await this.executeScript({ tabId, script });
    return result.result?.value || { success: false, reason: 'Script execution failed' };
  },

  async deleteClaudeConversation(params) {
    let { tabId, conversationId } = params;
    
    // If only conversationId provided, find or open the tab
    if (!tabId && conversationId) {
      const tabs = await this.getClaudeTabs();
      const existingTab = tabs.tabs?.find(tab => tab.url?.includes(`/chat/${conversationId}`));
      
      if (existingTab) {
        tabId = existingTab.id;
      } else {
        // Open the conversation
        const openResult = await this.openClaudeConversationTab({ conversationId });
        if (!openResult.success) {
          return { success: false, error: `Failed to open conversation: ${openResult.error}` };
        }
        tabId = openResult.tabId;
        // Wait a bit for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (!tabId) {
      return { success: false, error: 'Either tabId or conversationId is required' };
    }
    
    // Ensure debugger is attached
    try {
      await this.ensureDebuggerAttached(tabId);
    } catch (error) {
      return { 
        success: false, 
        reason: 'Failed to attach debugger',
        error: error.message 
      };
    }

    const script = `
      (async function() {
        try {
          // Get conversation ID from URL if not provided
          let convId = '${conversationId || ''}';
          if (!convId) {
            const urlMatch = window.location.href.match(/\\/chat\\/([a-f0-9-]{36})/);
            if (urlMatch) {
              convId = urlMatch[1];
            } else {
              return { success: false, reason: 'Could not determine conversation ID from URL' };
            }
          }
          
          // Extract organization ID from page context or use default pattern
          let orgId = null;
          try {
            // Try to get org ID from any API calls or page data
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
              const content = script.textContent || '';
              const orgMatch = content.match(/organizations\\/([a-f0-9-]{36})/);
              if (orgMatch) {
                orgId = orgMatch[1];
                break;
              }
            }
            
            // Fallback: try to extract from current fetch requests if available
            if (!orgId) {
              // This is a common org ID pattern we observed - use as fallback
              orgId = '1ada8651-e431-4f80-b5da-344eb1d3d5fa';
            }
          } catch (e) {
            orgId = '1ada8651-e431-4f80-b5da-344eb1d3d5fa'; // Fallback
          }
          
          // Get required headers from page context
          const headers = {
            'Content-Type': 'application/json',
            'anthropic-client-platform': 'web_claude_ai',
            'anthropic-client-sha': 'unknown',
            'anthropic-client-version': 'unknown'
          };
          
          // Try to get session-specific headers from meta tags or localStorage
          try {
            const metaAnonymousId = document.querySelector('meta[name="anthropic-anonymous-id"]');
            if (metaAnonymousId) {
              headers['anthropic-anonymous-id'] = metaAnonymousId.content;
            }
            
            const metaDeviceId = document.querySelector('meta[name="anthropic-device-id"]');
            if (metaDeviceId) {
              headers['anthropic-device-id'] = metaDeviceId.content;
            }
          } catch (e) {
            // Headers will be missing but might still work
          }
          
          // Construct the delete URL
          const deleteUrl = \`https://claude.ai/api/organizations/\${orgId}/chat_conversations/\${convId}\`;
          
          console.log('Calling DELETE API:', deleteUrl);
          
          // Make the DELETE request
          const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: headers,
            body: JSON.stringify({ uuid: convId }),
            credentials: 'include'
          });
          
          if (response.ok) {
            // Wait a moment then redirect to new conversation page
            await new Promise(r => setTimeout(r, 500));
            window.location.href = 'https://claude.ai/new';
            
            return { 
              success: true, 
              method: 'direct_api',
              conversationId: convId,
              organizationId: orgId,
              status: response.status,
              deletedAt: Date.now()
            };
          } else {
            const errorText = await response.text();
            return { 
              success: false, 
              reason: 'API call failed',
              status: response.status,
              error: errorText
            };
          }
          
        } catch (error) {
          return { 
            success: false, 
            method: 'direct_api_failed',
            reason: 'Network or API error',
            error: error.toString()
          };
        }
      })()
    `;
    
    try {
      const result = await this.executeScriptWithRetry(tabId, script);
      return result.result?.value || { success: false, reason: 'Script execution failed' };
    } catch (error) {
      return { 
        success: false, 
        reason: 'Script execution error',
        error: error.message 
      };
    }
  },

  async searchClaudeConversations(params) {
    try {
      // First get all conversations
      const allConversations = await this.getClaudeConversations();
      
      if (!Array.isArray(allConversations)) {
        return { success: false, error: 'Failed to retrieve conversations' };
      }
      
      // Apply filters
      let filtered = allConversations.filter(conv => {
        // Title search
        if (params.titleSearch) {
          const title = conv.title || '';
          if (!title.toLowerCase().includes(params.titleSearch.toLowerCase())) {
            return false;
          }
        }
        
        // Title regex
        if (params.titleRegex) {
          try {
            const regex = new RegExp(params.titleRegex, 'i');
            if (!regex.test(conv.title || '')) {
              return false;
            }
          } catch (e) {
            // Invalid regex, skip
          }
        }
        
        // Date filters
        if (params.createdAfter && new Date(conv.created_at) < new Date(params.createdAfter)) {
          return false;
        }
        if (params.createdBefore && new Date(conv.created_at) > new Date(params.createdBefore)) {
          return false;
        }
        
        // Message count filters
        if (params.minMessages !== undefined && (conv.message_count || 0) < params.minMessages) {
          return false;
        }
        if (params.maxMessages !== undefined && (conv.message_count || 0) > params.maxMessages) {
          return false;
        }
        
        // Open status filter
        if (params.openOnly && !conv.isOpen) {
          return false;
        }
        
        return true;
      });
      
      // Apply limit
      if (params.limit) {
        filtered = filtered.slice(0, params.limit);
      }
      
      return {
        success: true,
        conversations: filtered,
        total: filtered.length
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async bulkDeleteConversations(params) {
    const { conversationIds, batchSize = 5, delayMs = 1000 } = params;
    
    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return { success: false, error: 'conversationIds array is required' };
    }
    
    const results = {
      deleted: [],
      failed: [],
      total: conversationIds.length
    };
    
    // Process in batches
    for (let i = 0; i < conversationIds.length; i += batchSize) {
      const batch = conversationIds.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (convId) => {
        try {
          const result = await this.deleteClaudeConversation({ conversationId: convId });
          if (result.success) {
            results.deleted.push(convId);
          } else {
            results.failed.push({ id: convId, error: result.error });
          }
        } catch (error) {
          results.failed.push({ id: convId, error: error.message });
        }
      });
      
      await Promise.all(batchPromises);
      
      // Delay between batches
      if (i + batchSize < conversationIds.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return {
      success: results.failed.length === 0,
      deleted: results.deleted,
      failed: results.failed,
      deletedCount: results.deleted.length,
      failedCount: results.failed.length,
      totalProcessed: results.total
    };
  },

  async openClaudeConversationTab(params) {
    const { 
      conversationId, 
      activate = true, 
      waitForLoad = true, 
      loadTimeoutMs = 10000 
    } = params;
    
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('conversationId is required and must be a string');
    }

    // Validate conversation ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
      throw new Error('conversationId must be a valid UUID format');
    }

    try {
      // Check if conversation is already open in an existing tab
      const existingTabs = await new Promise((resolve) => {
        chrome.tabs.query({ url: `https://claude.ai/chat/${conversationId}` }, resolve);
      });

      if (existingTabs.length > 0) {
        const existingTab = existingTabs[0];
        
        // Activate the existing tab if requested
        if (activate) {
          await new Promise((resolve, reject) => {
            chrome.tabs.update(existingTab.id, { active: true }, (tab) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(tab);
              }
            });
          });
        }

        return {
          success: true,
          tabId: existingTab.id,
          conversationId: conversationId,
          url: existingTab.url,
          title: existingTab.title,
          wasExisting: true,
          activated: activate,
          createdAt: Date.now()
        };
      }

      // Create new tab with conversation URL
      const conversationUrl = `https://claude.ai/chat/${conversationId}`;
      const newTab = await new Promise((resolve, reject) => {
        chrome.tabs.create({ 
          url: conversationUrl, 
          active: activate 
        }, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });

      console.log(`CCM Extension: Created new tab ${newTab.id} for conversation ${conversationId}`);

      let loadVerified = false;
      let loadTimeMs = 0;
      let conversationTitle = null;
      let hasMessages = false;

      // Wait for page to load if requested
      if (waitForLoad) {
        const loadStartTime = Date.now();
        
        try {
          // Wait for tab to finish loading
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Load timeout after ${loadTimeoutMs}ms`));
            }, loadTimeoutMs);

            const checkLoading = () => {
              chrome.tabs.get(newTab.id, (tab) => {
                if (chrome.runtime.lastError) {
                  clearTimeout(timeout);
                  reject(new Error(chrome.runtime.lastError.message));
                  return;
                }

                if (tab.status === 'complete') {
                  clearTimeout(timeout);
                  resolve();
                } else {
                  setTimeout(checkLoading, 500);
                }
              });
            };

            checkLoading();
          });

          loadTimeMs = Date.now() - loadStartTime;

          // Verify conversation loaded correctly
          await this.ensureDebuggerAttached(newTab.id);
          
          const verifyScript = `
            (function() {
              try {
                // Check if we're on the right conversation page
                const isCorrectConversation = window.location.href.includes('${conversationId}');
                
                // Check if conversation content is loaded
                const hasConversationContainer = !!document.querySelector('[data-testid="conversation"]') || 
                                                !!document.querySelector('.conversation') ||
                                                !!document.querySelector('main');
                
                // Try to get conversation title
                const titleElement = document.querySelector('title') || 
                                   document.querySelector('h1') ||
                                   document.querySelector('[data-testid="conversation-title"]');
                const title = titleElement ? titleElement.textContent : null;
                
                // Check if there are messages
                const messageElements = document.querySelectorAll('[data-testid="user-message"], .font-claude-message, [data-message-author-role]');
                
                return {
                  isCorrectConversation,
                  hasConversationContainer,
                  conversationTitle: title,
                  hasMessages: messageElements.length > 0,
                  messageCount: messageElements.length,
                  url: window.location.href
                };
              } catch (error) {
                return {
                  error: error.toString(),
                  url: window.location.href
                };
              }
            })()
          `;
          
          const verifyResult = await this.executeScript({ tabId: newTab.id, script: verifyScript });
          const verification = verifyResult.result?.value;
          
          if (verification && !verification.error) {
            loadVerified = verification.isCorrectConversation && verification.hasConversationContainer;
            conversationTitle = verification.conversationTitle;
            hasMessages = verification.hasMessages;
          }
          
        } catch (loadError) {
          console.warn(`CCM Extension: Load verification failed for conversation ${conversationId}:`, loadError.message);
          // Non-fatal error - tab was created successfully
        }
      }

      return {
        success: true,
        tabId: newTab.id,
        conversationId: conversationId,
        url: conversationUrl,
        title: newTab.title,
        wasExisting: false,
        activated: activate,
        createdAt: Date.now(),
        loadVerified: loadVerified,
        loadTimeMs: loadTimeMs,
        conversationTitle: conversationTitle,
        hasMessages: hasMessages
      };

    } catch (error) {
      console.error(`CCM Extension: Error opening conversation ${conversationId}:`, error);
      throw new Error(`Failed to open conversation: ${error.message}`);
    }
  }
};