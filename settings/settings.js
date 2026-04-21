/**
 * Settings page — provider selection, API key storage, appearance preferences.
 * All data stored in chrome.storage.sync.
 */

const DEFAULT_WIDTH = 380;

const PROVIDERS = [
  { id: 'claude',  label: 'Claude',         model: 'claude-sonnet-4-6',     placeholder: 'sk-ant-...',              free: false },
  { id: 'gemini',  label: 'Gemini',          model: 'gemini-2.0-flash',      placeholder: 'AIza...',                 free: true  },
  { id: 'openai',  label: 'GPT-4o mini',     model: 'gpt-4o-mini',           placeholder: 'sk-...',                  free: false },
  { id: 'grok',    label: 'Grok',            model: 'grok-3-mini',           placeholder: 'xai-...',                 free: false },
  { id: 'groq',    label: 'Groq',            model: 'llama-3.3-70b',         placeholder: 'gsk_...',                 free: true  },
  { id: 'ollama',  label: 'Ollama (local)',  model: 'local model',           placeholder: 'http://localhost:11434',  free: true  }
];

const MODELS = {
  claude: [
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fastest, cheapest' },
    { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 — balanced (default)' },
    { id: 'claude-opus-4-7',           label: 'Opus 4.7 — most capable' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash',  label: 'Flash 2.0 — fast (default)' },
    { id: 'gemini-1.5-flash',  label: 'Flash 1.5 — fast & cheap' },
    { id: 'gemini-1.5-pro',    label: 'Pro 1.5 — more capable' },
    { id: 'gemini-2.5-pro',    label: 'Pro 2.5 — most capable' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini — cheap (default)' },
    { id: 'gpt-4o',      label: 'GPT-4o — more capable' },
    { id: 'o4-mini',     label: 'o4-mini — reasoning' },
  ],
  grok: [
    { id: 'grok-3-mini', label: 'Grok 3 mini — fast (default)' },
    { id: 'grok-3',      label: 'Grok 3 — more capable' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (default)' },
    { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B — fastest' },
    { id: 'gemma2-9b-it',            label: 'Gemma 2 9B' },
  ],
};

const KEY_PATTERNS = {
  claude: /^sk-ant-/,
  openai: /^sk-/,
  grok:   /^xai-/,
  groq:   /^gsk_/,
  gemini: /^AIza/,
  ollama: /^https?:\/\//
};

// Default prompt templates — must match sidebar.js ACTIONS defaults
const DEFAULT_PROMPTS = {
  explain:   'Explain the following clearly and concisely:\n\n"{{text}}"',
  summarize: 'Summarize this page in concise key bullet points:\n\n{{page}}',
  reply:     'Suggest exactly 3 short, distinct reply options to the following message. Number them 1, 2, 3:\n\n"{{text}}"',
  extract:   'Extract all structured data from the page below as a markdown table with clear headers:\n\n{{page}}',
};

const PROMPT_LABELS = {
  explain:   'Explain',
  summarize: 'Summarize',
  reply:     'Reply suggestions',
  extract:   'Extract Data',
};

let currentSettings = {
  activeProvider:  '',
  apiKeys:         {},
  selectedModels:  {},
  customPrompts:   {},
  sidebarPosition: 'right',
  sidebarWidth:    DEFAULT_WIDTH,
  language:        'auto',
  theme:           'dark',
};

// ── Theme ──────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  document.documentElement.dataset.theme = resolved;
}

// ── Load settings ──────────────────────────────────────────────────────────

async function loadSettings() {
  const stored = await chrome.storage.sync.get([
    'activeProvider', 'apiKeys', 'selectedModels', 'customPrompts',
    'sidebarPosition', 'sidebarWidth', 'language', 'theme'
  ]);
  currentSettings = {
    activeProvider:  stored.activeProvider  || '',
    apiKeys:         stored.apiKeys         || {},
    selectedModels:  stored.selectedModels  || {},
    customPrompts:   stored.customPrompts   || {},
    sidebarPosition: stored.sidebarPosition || 'right',
    sidebarWidth:    stored.sidebarWidth    || DEFAULT_WIDTH,
    language:        stored.language        || 'auto',
    theme:           stored.theme           || 'dark',
  };

  applyTheme(currentSettings.theme);
  renderProviderGrid();
  renderApiKeyList();
  renderPromptList();
  document.getElementById('sidebar-theme').value     = currentSettings.theme;
  document.getElementById('sidebar-position').value  = currentSettings.sidebarPosition;
  document.getElementById('sidebar-width').value     = currentSettings.sidebarWidth;
  document.getElementById('response-language').value = currentSettings.language;
}

// ── Provider grid ─────────────────────────────────────────────────────────

function getSelectedModelLabel(providerId) {
  const models  = MODELS[providerId];
  if (!models) return null;
  const modelId = currentSettings.selectedModels[providerId] || models[0]?.id;
  return models.find(m => m.id === modelId)?.label || modelId;
}

function renderProviderGrid() {
  const grid = document.getElementById('provider-grid');
  grid.innerHTML = '';
  for (const p of PROVIDERS) {
    const card = document.createElement('div');
    card.className = 'provider-card' + (currentSettings.activeProvider === p.id ? ' selected' : '');
    card.dataset.id = p.id;
    const modelLabel = getSelectedModelLabel(p.id) || p.model;
    card.innerHTML = `
      <div class="provider-card-name">${p.label}</div>
      <div class="provider-card-model">${modelLabel}</div>
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
    const row      = document.createElement('div');
    row.className  = 'api-key-row';
    const inputId  = `key-${p.id}`;
    const resultId = `result-${p.id}`;
    const modelId  = `model-${p.id}`;
    const isOllama = p.id === 'ollama';
    const models   = MODELS[p.id];

    let modelRowHtml = '';
    if (models) {
      const selectedModel = currentSettings.selectedModels[p.id] || models[0]?.id;
      const options = models.map(m =>
        `<option value="${m.id}"${m.id === selectedModel ? ' selected' : ''}>${m.label}</option>`
      ).join('');
      modelRowHtml = `
        <div class="model-select-row">
          <label class="model-select-label" for="${modelId}">Model</label>
          <select id="${modelId}" class="model-select">${options}</select>
        </div>
      `;
    }

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
      ${modelRowHtml}
      <div class="validate-result" id="${resultId}"></div>
    `;
    list.appendChild(row);
  }

  list.querySelectorAll('.validate-btn').forEach(btn => {
    btn.addEventListener('click', () => validateKey(btn.dataset.provider));
  });

  list.querySelectorAll('.model-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const providerId = sel.id.replace('model-', '');
      currentSettings.selectedModels[providerId] = sel.value;
      renderProviderGrid();
    });
  });
}

async function validateKey(providerId) {
  const input  = document.getElementById(`key-${providerId}`);
  const result = document.getElementById(`result-${providerId}`);
  const key    = input.value.trim();
  if (!key) { showResult(result, 'fail', 'Enter a key first'); return; }

  const pattern = KEY_PATTERNS[providerId];
  if (pattern && !pattern.test(key)) {
    result.textContent = '⚠ Key format looks unusual, validating anyway…';
    result.className   = 'validate-result warn';
  } else {
    result.textContent = 'Checking…';
    result.className   = 'validate-result';
  }

  try {
    const valid = await chrome.runtime.sendMessage({
      type: 'VALIDATE_KEY',
      provider: providerId,
      apiKey: key
    });
    if (valid?.ok) {
      showResult(result, 'ok', '✓ Valid');
    } else {
      showResult(result, 'fail', `✗ ${valid?.error || 'Invalid or unreachable'}`);
    }
  } catch (_) {
    showResult(result, 'ok', '✓ Saved (not verified)');
  }
}

function showResult(el, cls, msg) {
  el.textContent = msg;
  el.className   = `validate-result ${cls}`;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 5000);
}

// ── Prompt templates ──────────────────────────────────────────────────────

function renderPromptList() {
  const list = document.getElementById('prompt-list');
  list.innerHTML = '';
  for (const [key, defaultVal] of Object.entries(DEFAULT_PROMPTS)) {
    const current = currentSettings.customPrompts?.[key] || '';
    const div = document.createElement('div');
    div.className = 'prompt-row';
    div.innerHTML = `
      <div class="prompt-row-header">
        <label class="prompt-label" for="prompt-${key}">${PROMPT_LABELS[key]}</label>
        <button class="prompt-reset-btn" data-key="${key}">Reset to default</button>
      </div>
      <textarea id="prompt-${key}" class="prompt-textarea" rows="3"
                placeholder="${defaultVal.replace(/"/g, '&quot;')}">${current}</textarea>
    `;
    list.appendChild(div);
  }
  list.querySelectorAll('.prompt-reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(`prompt-${btn.dataset.key}`).value = '';
    });
  });
}

// ── Save ──────────────────────────────────────────────────────────────────

document.getElementById('save-btn').addEventListener('click', async () => {
  const apiKeys        = {};
  const selectedModels = {};
  const customPrompts  = {};

  for (const p of PROVIDERS) {
    const val = document.getElementById(`key-${p.id}`)?.value.trim();
    if (val) apiKeys[p.id] = val;

    const modelEl = document.getElementById(`model-${p.id}`);
    if (modelEl) selectedModels[p.id] = modelEl.value;
  }

  for (const key of Object.keys(DEFAULT_PROMPTS)) {
    const val = document.getElementById(`prompt-${key}`)?.value.trim();
    if (val) customPrompts[key] = val;
  }

  const settings = {
    activeProvider:  currentSettings.activeProvider,
    apiKeys,
    selectedModels,
    customPrompts,
    theme:           document.getElementById('sidebar-theme').value,
    sidebarPosition: document.getElementById('sidebar-position').value,
    sidebarWidth:    parseInt(document.getElementById('sidebar-width').value, 10) || DEFAULT_WIDTH,
    language:        document.getElementById('response-language').value
  };

  // Apply theme immediately on the settings page
  applyTheme(settings.theme);

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
