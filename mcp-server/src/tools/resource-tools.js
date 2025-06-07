// Resource State Management Tools
// Tools for managing critical extension resource state persistence

const { z } = require('zod');

/**
 * Resource management tool definitions
 */
const resourceTools = [
  {
    name: 'resource_state_summary',
    description: 'Get summary of all managed resource state',
    zodSchema: {}
  },
  {
    name: 'resource_register_debugger_session',
    description: 'Register debugger session attachment for persistence',
    zodSchema: {
      tabId: z.number().describe('Chrome tab ID'),
      source: z.enum(['self', 'external', 'existing']).describe('Source of debugger attachment').default('self'),
      purpose: z.string().describe('Purpose/reason for debugger attachment').default('unknown')
    }
  },
  {
    name: 'resource_detach_debugger_session',
    description: 'Unregister debugger session and mark for cleanup',
    zodSchema: {
      tabId: z.number().describe('Chrome tab ID')
    }
  },
  {
    name: 'resource_verify_debugger_session',
    description: 'Verify debugger session is still active and update state',
    zodSchema: {
      tabId: z.number().describe('Chrome tab ID')
    }
  },
  {
    name: 'resource_acquire_operation_lock',
    description: 'Acquire exclusive operation lock for tab',
    zodSchema: {
      tabId: z.number().describe('Chrome tab ID'),
      operation: z.string().describe('Operation name'),
      clientId: z.string().describe('Client ID acquiring lock'),
      timeout: z.number().describe('Lock timeout in milliseconds').default(30000)
    }
  },
  {
    name: 'resource_release_operation_lock',
    description: 'Release operation lock for tab',
    zodSchema: {
      tabId: z.number().describe('Chrome tab ID'),
      reason: z.string().describe('Reason for lock release').default('manual')
    }
  },
  {
    name: 'resource_start_network_monitoring',
    description: 'Register network monitoring session for tab',
    zodSchema: {
      tabId: z.number().describe('Chrome tab ID'),
      debuggerSessionId: z.string().describe('Associated debugger session ID').optional()
    }
  },
  {
    name: 'resource_stop_network_monitoring',
    description: 'Unregister network monitoring session',
    zodSchema: {
      tabId: z.number().describe('Chrome tab ID')
    }
  },
  {
    name: 'resource_register_content_script',
    description: 'Register content script injection for tab',
    zodSchema: {
      tabId: z.number().describe('Chrome tab ID'),
      version: z.string().describe('Extension version'),
      worlds: z.array(z.enum(['MAIN', 'ISOLATED'])).describe('Injected script worlds').default(['MAIN', 'ISOLATED'])
    }
  },
  {
    name: 'resource_unregister_content_script',
    description: 'Unregister content script for tab',
    zodSchema: {
      tabId: z.number().describe('Chrome tab ID')
    }
  },
  {
    name: 'resource_cleanup_orphaned',
    description: 'Find and cleanup orphaned resources needing recovery',
    zodSchema: {
      dryRun: z.boolean().describe('Only report what would be cleaned up, do not actually clean').default(true)
    }
  },
  {
    name: 'resource_extension_restart_recovery',
    description: 'Handle extension restart recovery process',
    zodSchema: {
      extensionStartupTime: z.number().describe('Extension startup timestamp')
    }
  }
];

/**
 * Resource management tool handlers
 */
const resourceHandlers = {
  'resource_state_summary': async (server, args) => {
    return server.resourceStateManager.getStateSummary();
  },

  'resource_register_debugger_session': async (server, args) => {
    const { tabId, source, purpose } = args;
    const success = server.resourceStateManager.attachDebuggerSession(tabId, source, purpose);
    return { success, tabId, source, purpose };
  },

  'resource_detach_debugger_session': async (server, args) => {
    const { tabId } = args;
    const success = server.resourceStateManager.detachDebuggerSession(tabId);
    return { success, tabId };
  },

  'resource_verify_debugger_session': async (server, args) => {
    const { tabId } = args;
    const result = server.resourceStateManager.verifyDebuggerSession(tabId);
    return { tabId, ...result };
  },

  'resource_acquire_operation_lock': async (server, args) => {
    const { tabId, operation, clientId, timeout } = args;
    const success = server.resourceStateManager.acquireOperationLock(tabId, operation, clientId, timeout);
    return { success, tabId, operation, clientId, timeout };
  },

  'resource_release_operation_lock': async (server, args) => {
    const { tabId, reason } = args;
    const success = server.resourceStateManager.releaseOperationLock(tabId, reason);
    return { success, tabId, reason };
  },

  'resource_start_network_monitoring': async (server, args) => {
    const { tabId, debuggerSessionId } = args;
    const success = server.resourceStateManager.startNetworkMonitoring(tabId, debuggerSessionId);
    return { success, tabId, debuggerSessionId };
  },

  'resource_stop_network_monitoring': async (server, args) => {
    const { tabId } = args;
    const success = server.resourceStateManager.stopNetworkMonitoring(tabId);
    return { success, tabId };
  },

  'resource_register_content_script': async (server, args) => {
    const { tabId, version, worlds } = args;
    const success = server.resourceStateManager.registerContentScript(tabId, version, worlds);
    return { success, tabId, version, worlds };
  },

  'resource_unregister_content_script': async (server, args) => {
    const { tabId } = args;
    const success = server.resourceStateManager.unregisterContentScript(tabId);
    return { success, tabId };
  },

  'resource_cleanup_orphaned': async (server, args) => {
    const { dryRun } = args;
    
    const orphaned = {
      debuggerSessions: server.resourceStateManager.getOrphanedDebuggerSessions(),
      operationLocks: server.resourceStateManager.getExpiredOperationLocks()
    };

    const results = {
      dryRun,
      found: {
        debuggerSessions: orphaned.debuggerSessions.length,
        operationLocks: orphaned.operationLocks.length
      },
      cleanupActions: []
    };

    if (!dryRun) {
      // Cleanup expired operation locks
      for (const { tabId } of orphaned.operationLocks) {
        server.resourceStateManager.releaseOperationLock(tabId, 'cleanup_orphaned');
        results.cleanupActions.push(`Released expired lock for tab ${tabId}`);
      }
    }

    return results;
  },

  'resource_extension_restart_recovery': async (server, args) => {
    const { extensionStartupTime } = args;
    const recoveryResults = await server.resourceStateManager.handleExtensionRestart(extensionStartupTime);
    return recoveryResults;
  }
};

module.exports = {
  resourceTools,
  resourceHandlers
};