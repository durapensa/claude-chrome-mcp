// Common test scenarios and workflows

const commonMessages = {
  simple: "What is 2 + 2?",
  medium: "Explain the concept of recursion in one paragraph",
  complex: "Write a detailed analysis of the pros and cons of microservices architecture",
  quick: "Hi",
  multiTurn: [
    "My favorite color is blue",
    "What is my favorite color?",
    "Now remember that my favorite number is 7",
    "What are my favorite color and number?"
  ]
};

const waitFor = async (condition, timeout = 30000, interval = 1000) => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
};

const waitForResponse = async (client, tabId, timeout = 30000) => {
  await waitFor(async () => {
    const response = await client.callTool('tab_get_response', { tabId });
    return response.completed;
  }, timeout);
  
  return await client.callTool('tab_get_response', { tabId });
};

const createAndPrepareTab = async (client) => {
  const { tabId } = await client.callTool('tab_create', {
    waitForLoad: true,
    injectContentScript: true
  });
  
  // Give tab a moment to fully initialize
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return tabId;
};

const sendAndWaitForResponse = async (client, tabId, message) => {
  await client.callTool('tab_send_message', {
    tabId,
    message,
    waitForCompletion: false
  });
  
  return await waitForResponse(client, tabId);
};

module.exports = {
  commonMessages,
  waitFor,
  waitForResponse,
  createAndPrepareTab,
  sendAndWaitForResponse
};