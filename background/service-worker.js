/**
 * Service Worker — handles keyboard shortcuts and routes messages to content scripts.
 * Runs in extension background context.
 */

// Load all provider classes at startup so VALIDATE_KEY handler can use them.
// Paths are relative to the extension root (not this file's directory).
importScripts(
  'providers/base-provider.js',
  'providers/openai-provider.js',   // must come before grok/groq (they extend it)
  'providers/claude-provider.js',
  'providers/gemini-provider.js',
  'providers/grok-provider.js',
  'providers/groq-provider.js',
  'providers/ollama-provider.js',
  'providers/provider-factory.js'
);

// ── Keyboard shortcut → active tab ─────────────────────────────────────────

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

// ── Message relay ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Relay toggle from popup to active tab
  if (msg.type === 'TOGGLE_SIDEBAR' && !sender.tab) {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' }).catch(console.error);
    });
  }

  // Return active tab info to popup
  if (msg.type === 'GET_ACTIVE_TAB_INFO' && !sender.tab) {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      sendResponse({ url: tab?.url, title: tab?.title });
    });
    return true; // async response
  }

  // ── API key / URL validation ──────────────────────────────────────────────
  // Called by settings.js when user clicks "Validate". Makes a real API call
  // using the provider class so we get an honest pass/fail.
  if (msg.type === 'VALIDATE_KEY') {
    (async () => {
      try {
        const p  = ProviderFactory.get(msg.provider, { [msg.provider]: msg.apiKey });
        const ok = await p.validate(msg.apiKey);
        sendResponse({ ok: !!ok });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true; // keep channel open for async response
  }
});
