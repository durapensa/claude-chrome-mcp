// Debug Operations for Chrome Extension
// Methods for debugging, DOM inspection, and script execution

export const debugOperationMethods = {
  async getDomElements(params) {
    const { tabId, selector } = params;
    const script = `
      Array.from(document.querySelectorAll('${selector}')).map(el => ({
        tagName: el.tagName,
        textContent: el.textContent?.substring(0, 200),
        className: el.className,
        id: el.id
      }))
    `;
    
    const result = await this.executeScript({ tabId, script });
    return result.result?.value || [];
  },

  async debugClaudePage(params) {
    const { tabId } = params;
    const script = `
      (function() {
        const input = document.querySelector('div[contenteditable="true"]');
        const sendButton = document.querySelector('button[aria-label*="Send"], button:has(svg[stroke])');
        
        return {
          pageReady: !!input,
          inputAvailable: !!input && !input.disabled,
          sendButtonAvailable: !!sendButton && !sendButton.disabled,
          url: window.location.href,
          title: document.title
        };
      })()
    `;
    
    const result = await this.executeScript({ tabId, script });
    return result.result?.value || { pageReady: false };
  },

  async executeScriptWithRetry(tabId, script, maxRetries = 2) {
    let lastError;
    
    for (let retry = 0; retry <= maxRetries; retry++) {
      try {
        const result = await this.executeScript({ tabId, script });
        return result;
        
      } catch (error) {
        lastError = error;
        console.log(`Script execution attempt ${retry + 1}/${maxRetries + 1} failed:`, error.message);
        
        if (retry < maxRetries) {
          // Try to reattach debugger before retry
          try {
            await this.ensureDebuggerAttached(tabId);
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (reattachError) {
            console.log('Failed to reattach debugger:', reattachError.message);
          }
        }
      }
    }
    
    throw lastError;
  }
};