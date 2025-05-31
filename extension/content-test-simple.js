// Simple content script test
console.log('CCM: Simple content script loaded!');
window.testContentScript = 'loaded';

// Test chrome.runtime availability
if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log('CCM: chrome.runtime is available');
  window.chromeRuntimeAvailable = true;
} else {
  console.log('CCM: chrome.runtime is NOT available');
  window.chromeRuntimeAvailable = false;
}