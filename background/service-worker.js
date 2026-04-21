/**
 * Service Worker — handles keyboard shortcuts and routes messages to content scripts.
 * Runs in extension background context.
 */

// Load all provider classes at startup so VALIDATE_KEY handler can use them.
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
    return true;
  }

  // ── API key / URL validation ──────────────────────────────────────────────
  if (msg.type === 'VALIDATE_KEY') {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Validation timed out after 10 seconds')), 10000)
    );
    (async () => {
      try {
        const p  = ProviderFactory.get(msg.provider, { [msg.provider]: msg.apiKey }, {});
        const ok = await Promise.race([p.validate(msg.apiKey), timeout]);
        sendResponse({ ok: !!ok });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true; // keep channel open for async response
  }
});

// ── Context menu ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ai-explain',   title: '✨ Explain with AI',  contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ai-reply',     title: '💬 Suggest reply',    contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ai-summarize', title: '📄 Summarize page',   contexts: ['page', 'selection'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const action = info.menuItemId.replace('ai-', '');
  const text   = info.selectionText || '';
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_ACTION', action, text });
  } catch (_) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] })
      .catch(console.error);
    chrome.tabs.sendMessage(tab.id, { type: 'CONTEXT_MENU_ACTION', action, text }).catch(console.error);
  }
});
