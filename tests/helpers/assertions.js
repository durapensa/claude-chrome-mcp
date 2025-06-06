// Domain-specific test assertions

const expectValidResponse = (response) => {
  expect(response).toBeDefined();
  expect(response).toHaveProperty('content');
  expect(response).toHaveProperty('completed');
  expect(response).toHaveProperty('isGenerating');
  expect(typeof response.content).toBe('string');
  expect(typeof response.completed).toBe('boolean');
  expect(typeof response.isGenerating).toBe('boolean');
};

const expectValidTab = (tab) => {
  expect(tab).toBeDefined();
  expect(tab).toHaveProperty('id');
  expect(tab).toHaveProperty('url');
  expect(tab).toHaveProperty('title');
  expect(typeof tab.id).toBe('number');
  expect(typeof tab.url).toBe('string');
};

const expectValidOperationResult = (result) => {
  expect(result).toBeDefined();
  if (result.success !== undefined) {
    expect(typeof result.success).toBe('boolean');
  }
  if (result.error) {
    expect(typeof result.error).toBe('string');
  }
};

const expectResponseContains = (response, expectedContent) => {
  expectValidResponse(response);
  const content = response.content.toLowerCase();
  if (Array.isArray(expectedContent)) {
    for (const expected of expectedContent) {
      expect(content).toContain(expected.toLowerCase());
    }
  } else {
    expect(content).toContain(expectedContent.toLowerCase());
  }
};

const expectTabInList = (tabs, tabId, shouldExist = true) => {
  const found = tabs.find(t => t.id === tabId);
  if (shouldExist) {
    expect(found).toBeTruthy();
    expectValidTab(found);
  } else {
    expect(found).toBeFalsy();
  }
};

const expectOperationSuccess = (result) => {
  expectValidOperationResult(result);
  if (result.success !== undefined) {
    expect(result.success).toBe(true);
  }
  expect(result.error).toBeUndefined();
};

module.exports = {
  expectValidResponse,
  expectValidTab,
  expectValidOperationResult,
  expectResponseContains,
  expectTabInList,
  expectOperationSuccess
};