/**
 * Settings page — provider selection, API key storage, appearance preferences.
 * All data stored in chrome.storage.sync.
 */

const PROVIDERS = [
  { id: 'claude',  label: 'Claude',         model: 'claude-sonnet-4-6',     placeholder: 'sk-ant-...',              free: false },
  { id: 'gemini',  label: 'Gemini',          model: 'gemini-2.0-flash',      placeholder: 'AIza...',                 free: true  },
  { id: 'openai',  label: 'GPT-4o mini',     model: 'gpt-4o-mini',           placeholder: 'sk-...',                  free: false },
  { id: 'grok',    label: 'Grok',            model: 'grok-3-mini',           placeholder: 'xai-...',                 free: false },
  { id: 'groq',    label: 'Groq',            model: 'llama-3.3-70b',         placeholder: 'gsk_...',                 free: true  },
  { id: 'ollama',  label: 'Ollama (local)',  model: 'local model',           placeholder: 'http://localhost:11434',  free: true  }
];

let currentSettings = {
  activeProvider: '',
  apiKeys: {},
  sidebarPosition: 'right',
  sidebarWidth: 380,
  language: 'auto'
};

// ── Load settings ──────────────────────────────────────────────────────────

async function loadSettings() {
  const stored = await chrome.storage.sync.get([
    'activeProvider', 'apiKeys', 'sidebarPosition', 'sidebarWidth', 'language'
  ]);
  currentSettings = {
    activeProvider:  stored.activeProvider  || '',
    apiKeys:         stored.apiKeys         || {},
    sidebarPosition: stored.sidebarPosition || 'right',
    sidebarWidth:    stored.sidebarWidth    || 380,
    language:        stored.language        || 'auto'
  };
  renderProviderGrid();
  renderApiKeyList();
  document.getElementById('sidebar-position').value = currentSettings.sidebarPosition;
  document.getElementById('sidebar-width').value    = currentSettings.sidebarWidth;
  document.getElementById('response-language').value = currentSettings.language;
}

// ── Provider grid ─────────────────────────────────────────────────────────

function renderProviderGrid() {
  const grid = document.getElementById('provider-grid');
  grid.innerHTML = '';
  for (const p of PROVIDERS) {
    const card = document.createElement('div');
    card.className = 'provider-card' + (currentSettings.activeProvider === p.id ? ' selected' : '');
    card.dataset.id = p.id;
    card.innerHTML = `
      <div class="provider-card-name">${p.label}</div>
      <div class="provider-card-model">${p.model}</div>
      <div class="provider-card-badge ${p.free ? 'badge-free' : 'badge-paid'}">${p.free ? 'Free tier' : 'Paid'}</div>
    `;
    card.addEventListener('click', () => selectProvider(p.id));
    grid.appendChild(card);
  }
}

function selectProvider(id) {
  currentSettings.activeProvider = id;
  renderProviderGrid();
}

// ── API key list ──────────────────────────────────────────────────────────

function renderApiKeyList() {
  const list = document.getElementById('api-key-list');
  list.innerHTML = '';
  for (const p of PROVIDERS) {
    const row = document.createElement('div');
    row.className = 'api-key-row';
    const inputId = `key-${p.id}`;
    const resultId = `result-${p.id}`;
    const isOllama = p.id === 'ollama';
    row.innerHTML = `
      <label class="api-key-label" for="${inputId}">
        ${p.label}${isOllama ? '<span class="api-key-sublabel"> — Server URL</span>' : ''}
      </label>
      <div class="api-key-input-group">
        <input type="${isOllama ? 'text' : 'password'}" id="${inputId}" class="api-key-input"
               placeholder="${p.placeholder}"
               value="${currentSettings.apiKeys[p.id] || ''}" autocomplete="off">
        <button class="validate-btn" data-provider="${p.id}">${isOllama ? 'Test' : 'Validate'}</button>
      </div>
      <div class="validate-result" id="${resultId}"></div>
    `;
    list.appendChild(row);
  }

  // Validate buttons
  list.querySelectorAll('.validate-btn').forEach(btn => {
    btn.addEventListener('click', () => validateKey(btn.dataset.provider));
  });
}

async function validateKey(providerId) {
  const input  = document.getElementById(`key-${providerId}`);
  const result = document.getElementById(`result-${providerId}`);
  const key    = input.value.trim();
  if (!key) { showResult(result, 'fail', 'Enter a key first'); return; }

  result.textContent = 'Checking…';
  result.className   = 'validate-result';

  try {
    // Dynamically load provider scripts to validate
    const valid = await chrome.runtime.sendMessage({
      type: 'VALIDATE_KEY',
      provider: providerId,
      apiKey: key
    });
    showResult(result, valid?.ok ? 'ok' : 'fail', valid?.ok ? '✓ Valid' : '✗ Invalid or unreachable');
  } catch (_) {
    // Fallback: just mark as saved without network check
    showResult(result, 'ok', '✓ Saved (not verified)');
  }
}

function showResult(el, cls, msg) {
  el.textContent = msg;
  el.className   = `validate-result ${cls}`;
  setTimeout(() => {
    if (el.textContent === msg) el.textContent = '';
  }, 4000);
}

// ── Save ──────────────────────────────────────────────────────────────────

document.getElementById('save-btn').addEventListener('click', async () => {
  // Collect API keys from inputs
  const apiKeys = {};
  for (const p of PROVIDERS) {
    const val = document.getElementById(`key-${p.id}`)?.value.trim();
    if (val) apiKeys[p.id] = val;
  }

  const settings = {
    activeProvider:  currentSettings.activeProvider,
    apiKeys,
    sidebarPosition: document.getElementById('sidebar-position').value,
    sidebarWidth:    parseInt(document.getElementById('sidebar-width').value, 10) || 380,
    language:        document.getElementById('response-language').value
  };

  const status = document.getElementById('save-status');
  try {
    await chrome.storage.sync.set(settings);
    currentSettings = settings;
    status.textContent = '✓ Settings saved';
    status.className   = 'save-status ok';
  } catch (e) {
    status.textContent = '✗ Failed to save: ' + e.message;
    status.className   = 'save-status fail';
  }
  setTimeout(() => { status.textContent = ''; status.className = 'save-status'; }, 3000);
});

// ── Init ──────────────────────────────────────────────────────────────────
loadSettings();
