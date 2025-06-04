# Tool Architecture Reorganization

**Project Priority**: Phase 2 TypeScript refinement and testing  
**Version**: 2.6.0  
**Status**: Phase 1 complete - 53 tools (28 legacy + 25 new) deployed with pure domain separation

## Current Status

**✅ PHASE 1 COMPLETE**: Parallel deployment achieved zero-downtime transition
- **Legacy tools**: 28 tools preserved for backward compatibility
- **New tools**: 25 reorganized tools with pure domain separation  
- **Documentation**: Updated to showcase new tools as primary examples
- **Architecture**: Both tool sets coexist in production

## Phase 2 Objectives

### TypeScript Refinement
**Target**: Replace 5 tools using `any` types with proper interfaces
- `tab_forward_response`, `tab_batch_operations` - Complex tab operations
- `api_search_conversations`, `api_get_conversation_url`, `api_delete_conversations` - API operations
- `system_wait_operation` - System infrastructure

### Comprehensive Testing
**Requirement**: Validate all 53 tools preserve exact functionality
- **High Risk**: Tools with refined TypeScript types
- **Medium Risk**: New tool parameter interfaces  
- **Standard**: Legacy tool compatibility verification

## New Tool Architecture (25 tools)

**SYSTEM (2)**: Core infrastructure
- `system_health`, `system_wait_operation`

**CHROME (7)**: Browser control only
- `chrome_reload_extension`, `chrome_debug_attach`, `chrome_execute_script`
- `chrome_get_dom_elements`, `chrome_start_network_monitoring`
- `chrome_stop_network_monitoring`, `chrome_get_network_requests`

**TAB (11)**: Tab operations via `tabId` only  
- `tab_create`, `tab_list`, `tab_close`, `tab_send_message`
- `tab_get_response`, `tab_get_response_status`, `tab_forward_response`
- `tab_extract_elements`, `tab_export_conversation`, `tab_debug_page`
- `tab_batch_operations`

**API (5)**: Claude.ai API via `conversationId` only
- `api_list_conversations`, `api_search_conversations`
- `api_get_conversation_metadata`, `api_get_conversation_url`
- `api_delete_conversations`

## Legacy Cleanup Strategy

### Current State Assessment
- **Documentation**: Already migrated to new tools in CLAUDE.md and docs/CONTINUATION.md
- **Test files**: 3 test files still reference legacy tools, require updates
- **External integrations**: Claude Desktop, Cursor may use legacy tools

### Safe Cleanup Criteria
**DO NOT REMOVE** until:
1. All test files updated to new tools
2. External integration compatibility verified
3. Deprecation period completed (future consideration)

**CAN ENHANCE** immediately:
- Add proper TypeScript interfaces for `any` types
- Improve tool descriptions and composability
- Comprehensive testing validation

## Phase 2 Implementation Plan

### TypeScript Interface Additions
**Required interfaces** for shared/mcp-tool-types.ts:
- `TabForwardResponseParams`, `TabBatchOperationsParams`
- `ApiSearchConversationsParams`, `ApiGetConversationUrlParams`, `ApiDeleteConversationsParams`  
- `SystemWaitOperationParams`

### Validation Requirements
- **All 53 tools tested** - Legacy and new tool functionality verified
- **Parameter compatibility** - Both legacy and new calling patterns work
- **Cross-tool integration** - Forwarding, batch operations, complex workflows
- **Zero regression** - Existing functionality preserved exactly

### Critical Safety Measures
- **Backward compatible** - New interfaces must not break existing calls
- **Optional parameters** - All new parameters optional where legacy calls work
- **Response preservation** - Exact response formats maintained
- **TypeScript union updates** - Replace `any` types without breaking compilation

## Success Criteria

- [ ] All 53 tools tested and functional
- [ ] TypeScript provides type safety for tools previously using `any`
- [ ] No regression in legacy tool functionality
- [ ] New tools properly typed and tested
- [ ] Tool architecture enables safe future cleanup

## Next Steps

See TodoRead for current Phase 2 implementation tasks. This phase establishes the foundation for eventual legacy tool deprecation while maintaining full backward compatibility.

---

*Phase 2 maintains Critical Directives: enhance without breaking, test immediately, prepare for future cleanup.*