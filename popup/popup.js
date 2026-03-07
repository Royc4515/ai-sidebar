/**
 * Popup — shows active provider status and toggles sidebar on active tab.
 */

async function init() {
  const stored = await chrome.storage.sync.get(['activeProvider', 'apiKeys']);
  const provider = stored.activeProvider;
  const hasKey   = provider && (stored.apiKeys?.[provider] || provider === 'ollama');

  const dot  = document.getElementById('status-dot');
  const name = document.getElementById('provider-name-text');

  const LABELS = {
    claude: 'Claude', gemini: 'Gemini', openai: 'GPT-4o mini',
    grok: 'Grok', groq: 'Groq', ollama: 'Ollama (local)'
  };

  if (provider && hasKey) {
    dot.classList.remove('none');
    name.textContent = `${LABELS[provider] || provider} active`;
    name.classList.remove('provider-none');
  } else if (provider) {
    dot.style.background = '#f0a030';
    name.textContent = `${LABELS[provider] || provider} — no key`;
    name.classList.remove('provider-none');
  }

  document.getElementById('toggle-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_SIDEBAR' });
    window.close();
  });

  document.getElementById('settings-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });
}

init();
