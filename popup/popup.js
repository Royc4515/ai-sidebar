/**
 * Popup — provider status + open sidebar.
 */
async function init() {
  const stored = await chrome.storage.sync.get(['activeProvider', 'apiKeys']);
  const provider = stored.activeProvider;
  const hasKey = provider && (stored.apiKeys?.[provider] || provider === 'ollama');

  const dot = document.getElementById('status-dot');
  const name = document.getElementById('provider-name-text');
  const sub  = document.getElementById('provider-model-text');

  const META = {
    claude:  { label: 'Claude',  model: 'sonnet-4-6' },
    gemini:  { label: 'Gemini',  model: '2.0-flash' },
    openai:  { label: 'GPT-4o',  model: 'mini' },
    grok:    { label: 'Grok',    model: '3-mini' },
    groq:    { label: 'Groq',    model: 'llama-3.3' },
    ollama:  { label: 'Ollama',  model: 'local' },
  };

  if (provider && hasKey) {
    dot.classList.add('ok');
    name.textContent = META[provider]?.label || provider;
    sub.textContent  = META[provider]?.model || '';
  } else if (provider) {
    dot.classList.add('warn');
    name.textContent = `${META[provider]?.label || provider} — no key`;
  }

  document.getElementById('toggle-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_SIDEBAR' });
    window.close();
  });
  document.getElementById('settings-link').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
}
init();
