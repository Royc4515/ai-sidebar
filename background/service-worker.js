/**
 * Service Worker — handles keyboard shortcuts and routes messages to content scripts.
 * Runs in extension background context.
 */

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-sidebar') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }).catch(() => {
      // Content script not yet injected — inject it first
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js']
      }).then(() => {
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
      }).catch(console.error);
    });
  }
});

// Relay messages from popup to active tab's content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TOGGLE_SIDEBAR' && !sender.tab) {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }).catch(console.error);
    });
  }
  if (msg.type === 'GET_ACTIVE_TAB_INFO' && !sender.tab) {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      sendResponse({ url: tab?.url, title: tab?.title });
    });
    return true; // async response
  }
});
