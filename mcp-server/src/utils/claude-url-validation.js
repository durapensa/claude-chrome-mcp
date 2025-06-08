/**
 * Claude.ai URL and ID Validation Utilities
 * 
 * Centralized validation functions for Claude.ai URLs, conversation IDs,
 * and related format checking. Keeps tool files clean and provides
 * reusable validation logic across the codebase.
 */

/**
 * Validates if a string is a valid UUID format
 * Used for conversation IDs and other UUID-based identifiers
 * 
 * @param {string} uuid - String to validate
 * @returns {boolean} True if valid UUID format
 */
function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates if a string is a valid Claude conversation ID
 * Currently same as UUID validation, but separated for clarity
 * 
 * @param {string} conversationId - Conversation ID to validate
 * @returns {boolean} True if valid conversation ID format
 */
function isValidConversationId(conversationId) {
  return isValidUUID(conversationId);
}

/**
 * Validates if a URL is a Claude.ai URL
 * 
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is from claude.ai domain
 */
function isClaudeUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'claude.ai' || urlObj.hostname.endsWith('.claude.ai');
  } catch (error) {
    return false;
  }
}

/**
 * Extracts conversation ID from a Claude.ai URL
 * 
 * @param {string} url - Claude.ai URL
 * @returns {string|null} Conversation ID if found, null otherwise
 */
function extractConversationId(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  const match = url.match(/\/chat\/([a-f0-9-]+)/);
  if (match && isValidConversationId(match[1])) {
    return match[1];
  }
  
  return null;
}

/**
 * Validates conversation ID format and throws descriptive error if invalid
 * Useful for tool parameter validation
 * 
 * @param {string} conversationId - Conversation ID to validate
 * @throws {Error} If conversation ID is invalid
 */
function requireValidConversationId(conversationId) {
  if (!conversationId) {
    throw new Error('conversationId is required');
  }
  
  if (!isValidConversationId(conversationId)) {
    throw new Error('conversationId must be a valid UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
  }
}

module.exports = {
  isValidUUID,
  isValidConversationId,
  isClaudeUrl,
  extractConversationId,
  requireValidConversationId
};