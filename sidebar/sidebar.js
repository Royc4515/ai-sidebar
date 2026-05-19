// ── State ──────────────────────────────────────────────────────────────────
let settings     = {};
let provider     = null;
let selectedText = '';
let pageContent  = '';
let turns        = [];      // { role, content, display?, action?, model?, html?, loading?, streaming? }
let activeTab    = 'chat';
let pickerOpen   = false;
let busy         = false;
let _renderPending = false;

const PROVIDERS = [
  { id: 'claude', name: 'Claude', model: '3.5 Sonnet',   hue: 'var(--p-claude)' },
  { id: 'gemini', name: 'Gemini', model: '2.0 Flash',    hue: 'var(--p-gemini)' },
  { id: 'openai', name: 'GPT-4o', model: '4o mini',      hue: 'var(--p-gpt)'    },
  { id: 'grok',   name: 'Grok',   model: 'Grok-2',       hue: 'var(--p-grok)'   },
  { id: 'groq',   name: 'Groq',   model: 'Llama 3.3',    hue: 'var(--p-groq)'   },
  { id: 'ollama', name: 'Ollama', model: 'Local',         hue: 'var(--p-ollama)' },
];

const ACTION_LABELS = {
  explain: 'Explanation', summarize: 'Summary', ask: 'Answer',
  reply: 'Reply suggestions', extract: 'Extracted data',
  translate: 'Translation', rewrite: 'Rewrite', find: 'Found on page'
};

const TOOL_DEFS = {
  page: [
    { id: 'summarize',      label: 'Summarize',    sub: 'Smart digest of the page',  iconPath: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>' },
    { id: 'extract',        label: 'Extract data', sub: 'Tables, lists, facts',      iconPath: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>' },
    { id: 'find',           label: 'Find on page', sub: 'Search & quote sections',   iconPath: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>' },
    { id: 'translate-page', label: 'Translate',    sub: 'Match your language',       iconPath: '<path d="M4 5h7M7.5 4v2M5 9c.7 2.5 2 4.5 4 6M11 9c-1.5 4-4 6.5-7 8M14 21l4-9 4 9M15.5 18h5"/>' },
  ],
  sel: [
    { id: 'explain',   label: 'Explain',   sub: 'Clear explanation',    iconPath: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.7 1.5 1.5 1.5 2.5h5c0-1 .7-1.8 1.5-2.5A6 6 0 0 0 12 3z"/>' },
    { id: 'reply',     label: 'Reply',     sub: '3 reply suggestions',  iconPath: '<path d="M9 14l-4-4 4-4"/><path d="M5 10h7a6 6 0 0 1 6 6v2"/>' },
    { id: 'translate', label: 'Translate', sub: 'Translate selection',  iconPath: '<path d="M4 5h7M7.5 4v2M5 9c.7 2.5 2 4.5 4 6M11 9c-1.5 4-4 6.5-7 8M14 21l4-9 4 9M15.5 18h5"/>' },
    { id: 'rewrite',   label: 'Rewrite',   sub: 'Improve clarity',      iconPath: '<path d="M14 4l6 6L9 21H3v-6z"/>' },
  ]
};

const CMD_BAR = [
  { id: 'summarize',      label: 'Summarize', accent: true },
  { id: 'extract',        label: 'Extract' },
  { id: 'translate-page', label: 'Translate' },
  { id: 'rewrite-page',   label: 'Rewrite' },
  { id: 'find-prompt',    label: 'Find' },
];

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  await loadSettings();
  bindUI();
  renderHeader();
  renderHero();
  renderTools();
  renderCmdbar();
  requestPageContent();
}

async function loadSettings() {
  settings = await chrome.storage.sync.get(['activeProvider','apiKeys','language']);
  settings.apiKeys = settings.apiKeys || {};
  if (!settings.activeProvider || (!settings.apiKeys[settings.activeProvider] && settings.activeProvider !== 'ollama')) {
    showOnboarding(); return;
  }
  try {
    provider = ProviderFactory.get(settings.activeProvider, settings.apiKeys);
    hideOnboarding();
  } catch (e) { showOnboarding(); }
}

function bindUI() {
  document.getElementById('close-btn').onclick = () =>
    window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
  document.getElementById('settings-btn').onclick = () => chrome.runtime.openOptionsPage();
  document.getElementById('onboarding-settings-btn').onclick = () => chrome.runtime.openOptionsPage();
  document.getElementById('new-chat-btn').onclick = newChat;
  document.getElementById('model-btn').onclick = () => togglePicker();

  document.getElementById('ask-btn').onclick = handleAsk;
  const input = document.getElementById('ask-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  });

  document.querySelectorAll('.sb-tab').forEach(t => {
    t.onclick = () => switchTab(t.dataset.tab);
  });

  document.getElementById('retry-btn').onclick = () => {
    document.getElementById('error-state').style.display = 'none';
    const last = turns[turns.length - 1];
    if (last?.role === 'user') runPrompt(last.label || 'ask');
  };

  document.getElementById('selection-wrap').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) handleAction(btn.dataset.action);
  });
}

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.sb-tab').forEach(t =>
    t.classList.toggle('is-active', t.dataset.tab === name));
  document.getElementById('tab-chat').style.display  = name === 'chat'  ? '' : 'none';
  document.getElementById('tab-tools').style.display = name === 'tools' ? '' : 'none';
}

// ── Onboarding ─────────────────────────────────────────────────────────
function showOnboarding() {
  document.getElementById('onboarding').style.display = 'flex';
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('tabs').style.display = 'none';
}
function hideOnboarding() {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('main-content').style.display = 'flex';
  document.getElementById('tabs').style.display = 'flex';
}

// ── New Chat ───────────────────────────────────────────────────────────
function newChat() {
  if (busy) return;
  turns = [];
  selectedText = '';
  updateSelectionUI();
  document.getElementById('hero').style.display = '';
  document.getElementById('turns').innerHTML = '';
  document.getElementById('error-state').style.display = 'none';
  const input = document.getElementById('ask-input');
  input.value = '';
  input.style.height = 'auto';
  renderHero();
}

// ── Header / Picker ────────────────────────────────────────────────────
function activeProviderInfo() {
  return PROVIDERS.find(p => p.id === settings.activeProvider) || PROVIDERS[0];
}

function renderHeader() {
  const p = activeProviderInfo();
  document.getElementById('model-name').textContent = p.name;
  document.getElementById('model-dot').style.background = p.hue;
  document.getElementById('composer-model-name').textContent = p.name;
  document.getElementById('composer-dot').style.background = p.hue;
}

function togglePicker() {
  pickerOpen = !pickerOpen;
  const host = document.getElementById('picker-host');
  document.getElementById('model-btn').setAttribute('aria-expanded', String(pickerOpen));
  if (!pickerOpen) { host.innerHTML = ''; return; }

  host.innerHTML = `
    <div class="sb-picker-veil" id="picker-veil"></div>
    <div class="sb-picker" role="listbox">
      <div class="sb-picker-label">Switch model</div>
      ${PROVIDERS.map(p => `
        <button class="sb-picker-row${p.id===settings.activeProvider?' is-active':''}" data-id="${p.id}">
          <span class="dot" style="background:${p.hue}"></span>
          <span class="sb-picker-name">${p.name}</span>
          <span class="sb-picker-model">${p.model}</span>
          ${p.id===settings.activeProvider?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg>':''}
        </button>
      `).join('')}
    </div>
  `;
  document.getElementById('picker-veil').onclick = () => togglePicker();
  host.querySelectorAll('.sb-picker-row').forEach(b => {
    b.onclick = async () => {
      const id = b.dataset.id;
      if (id === settings.activeProvider) { togglePicker(); return; }
      if (!settings.apiKeys[id] && id !== 'ollama') {
        togglePicker(); chrome.runtime.openOptionsPage(); return;
      }
      settings.activeProvider = id;
      await chrome.storage.sync.set({ activeProvider: id });
      try { provider = ProviderFactory.get(id, settings.apiKeys); } catch(e){}
      renderHeader();
      togglePicker();
    };
  });
}

// ── Hero suggestions ───────────────────────────────────────────────────
function renderHero() {
  const wrap = document.getElementById('hero-suggest');
  const items = [
    { id: 'summarize',      t: 'Summarize this page',       icon: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>' },
    { id: 'extract',        t: 'Extract key points & data', icon: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>' },
    { id: 'translate-page', t: 'Translate this page',       icon: '<path d="M4 5h7M7.5 4v2M5 9c.7 2.5 2 4.5 4 6M11 9c-1.5 4-4 6.5-7 8M14 21l4-9 4 9M15.5 18h5"/>' },
  ];
  wrap.innerHTML = items.map(i => `
    <button class="sb-suggest-btn" data-action="${i.id}">
      <span style="display:inline-flex;align-items:center;gap:8px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${i.icon}</svg>
        <span>${i.t}</span>
      </span>
      <svg class="sb-suggest-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
    </button>
  `).join('');
  wrap.querySelectorAll('button').forEach(b => {
    b.onclick = () => handleAction(b.dataset.action);
  });
}

// ── Tools tab ──────────────────────────────────────────────────────────
function renderTools() {
  const cardHtml = (a) => `
    <button class="sb-action-card" data-action="${a.id}">
      <span class="sb-action-card-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${a.iconPath}</svg>
      </span>
      <span class="sb-action-card-body">
        <span class="sb-action-card-title">${a.label}</span>
        <span class="sb-action-card-sub">${a.sub}</span>
      </span>
    </button>`;
  document.getElementById('page-actions').innerHTML = TOOL_DEFS.page.map(cardHtml).join('');
  document.getElementById('selection-actions').innerHTML = TOOL_DEFS.sel.map(cardHtml).join('');
  document.querySelectorAll('.sb-action-card').forEach(c => {
    c.onclick = () => { switchTab('chat'); handleAction(c.dataset.action); };
  });
}

// ── Command bar ────────────────────────────────────────────────────────
function renderCmdbar() {
  const bar = document.getElementById('cmdbar');
  bar.innerHTML = CMD_BAR.map(c => `
    <button class="sb-chip${c.accent?' sb-chip--accent':''}" data-action="${c.id}">${c.label}</button>
  `).join('');
  bar.querySelectorAll('.sb-chip').forEach(b =>
    b.onclick = () => handleAction(b.dataset.action));
}

// ── Page / selection messaging ─────────────────────────────────────────
function requestPageContent() {
  window.parent.postMessage({ type: 'REQUEST_PAGE_CONTENT' }, '*');
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'PAGE_CONTENT')  pageContent = msg.content || '';
  if (msg.type === 'SELECTED_TEXT') { selectedText = msg.text || ''; updateSelectionUI(); }
  if (msg.type === 'SIDEBAR_OPENED') {
    if (msg.dir === 'rtl' || msg.dir === 'ltr') document.documentElement.dir = msg.dir;
    requestPageContent();
    window.parent.postMessage({ type: 'REQUEST_SELECTED_TEXT' }, '*');
  }
  if (msg.type === 'SELECTION_TRIGGER') {
    if (msg.text) { selectedText = msg.text; updateSelectionUI(); }
    switchTab('chat');
    document.getElementById('tab-chat').scrollTop = 0;
  }
  if (msg.type === 'CONTEXT_MENU_ACTION') {
    if (msg.text) { selectedText = msg.text; updateSelectionUI(); }
    handleAction(msg.action);
  }
});

chrome.storage.onChanged.addListener((changes) => {
  // Skip our own activeProvider write — we updated `provider` and `settings` already.
  const keys = Object.keys(changes);
  if (keys.length === 1 && keys[0] === 'activeProvider'
      && changes.activeProvider.newValue === settings.activeProvider) return;
  loadSettings();
});

function updateSelectionUI() {
  const wrap = document.getElementById('selection-wrap');
  const prev = document.getElementById('selected-preview');
  if (selectedText) {
    wrap.style.display = '';
    prev.textContent = selectedText.length > 240 ? selectedText.slice(0, 240) + '…' : selectedText;
  } else {
    wrap.style.display = 'none';
  }
}

const MAX_HISTORY_TURNS = 20;

function buildConversationMessages() {
  const msgs = turns
    .filter(t => !t.loading &&
      (t.role === 'user' || (t.role === 'assistant' && t.content)))
    .map(t => ({ role: t.role, content: t.content }));
  return msgs.length > MAX_HISTORY_TURNS ? msgs.slice(-MAX_HISTORY_TURNS) : msgs;
}

// ── Action dispatch ────────────────────────────────────────────────────
async function handleAction(action) {
  if (!provider) { showOnboarding(); return; }
  if (busy) return;

  let content, display, label;

  switch (action) {
    case 'summarize':
    case 'extract':
    case 'translate-page':
    case 'rewrite-page': {
      if (!pageContent) return showError('Could not read this page.');
      const cfg = PAGE_ACTIONS[action];
      content = cfg.content;
      display = cfg.display;
      label   = cfg.label;
      break;
    }
    case 'find':
    case 'find-prompt': {
      const inp = document.getElementById('ask-input');
      inp.placeholder = 'What should I find on this page?';
      inp.focus();
      return;
    }
    case 'explain':
      if (!selectedText) return showError('Select some text first.');
      content = `Explain this clearly and concisely:\n\n"${selectedText}"`;
      display = `Explain: "${ellipsis(selectedText, 80)}"`;
      label = 'explain'; break;
    case 'reply':
      if (!selectedText) return showError('Select a message first.');
      content = `Suggest 3 short, distinct reply options to this message. Number them 1, 2, 3:\n\n"${selectedText}"`;
      display = `Reply to: "${ellipsis(selectedText, 80)}"`;
      label = 'reply'; break;
    case 'translate':
      if (!selectedText) return showError('Select some text first.');
      content = `Translate this text to English. Preserve formatting:\n\n"${selectedText}"`;
      display = `Translate: "${ellipsis(selectedText, 80)}"`;
      label = 'translate'; break;
    case 'rewrite':
      if (!selectedText) return showError('Select some text first.');
      content = `Rewrite this to be clearer and more concise:\n\n"${selectedText}"`;
      display = `Rewrite: "${ellipsis(selectedText, 80)}"`;
      label = 'rewrite'; break;
    default:
      return;
  }

  pushTurn({ role: 'user', content, display, label });
  await runPrompt(label);
}

async function handleAsk() {
  if (!provider) { showOnboarding(); return; }
  if (busy) return;
  const input = document.getElementById('ask-input');
  const q = input.value.trim();
  if (!q) return;
  input.value = ''; input.style.height = 'auto';
  pushTurn({ role: 'user', content: q, label: 'ask' });
  await runPrompt('ask');
}

// ── Core prompt runner (streaming) ────────────────────────────────────
async function runPrompt(label) {
  busy = true;
  const skel = pushTurn({ role: 'assistant', loading: true, action: ACTION_LABELS[label] || label });
  document.getElementById('ask-btn').disabled = true;

  const messages = buildConversationMessages();
  const langName = getLanguageName();
  const systemPrompt = provider.buildSystemPrompt(truncate(pageContent), langName);

  let accum = '';
  try {
    await provider.completeStream(messages, systemPrompt, (chunk) => {
      accum += chunk;
      skel.loading = false;
      skel.streaming = true;
      skel.content = accum;
      scheduleRenderTurns();
    });
    skel.loading = false;
    skel.streaming = false;
    skel.content = accum;
    skel.html = renderMarkdown(accum);
    skel.model = activeProviderInfo();
    renderTurns();
  } catch (err) {
    turns.pop();
    renderTurns();
    showError(err.message || 'An unexpected error occurred.');
  } finally {
    busy = false;
    document.getElementById('ask-btn').disabled = false;
  }
}

// RAF-batched: parse markdown for the streaming turn once per frame, not per chunk.
function scheduleRenderTurns() {
  if (_renderPending) return;
  _renderPending = true;
  requestAnimationFrame(() => {
    _renderPending = false;
    const last = turns[turns.length - 1];
    if (last?.streaming && last.content) last.html = renderMarkdown(last.content);
    renderTurns();
  });
}

function pushTurn(t) {
  turns.push(t);
  document.getElementById('hero').style.display = 'none';
  renderTurns();
  return t;
}

function renderTurns() {
  const root = document.getElementById('turns');
  root.innerHTML = turns.map((t, i) => turnHtml(t, i)).join('');
  root.querySelectorAll('[data-copy]').forEach(b => {
    b.onclick = () => {
      const idx = +b.dataset.copy;
      navigator.clipboard.writeText(turns[idx]?.content || '');
      b.title = 'Copied!';
    };
  });
  const scroller = document.getElementById('tab-chat');
  scroller.scrollTop = scroller.scrollHeight;
}

function turnHtml(t, i) {
  if (t.role === 'user') {
    return `
      <div class="sb-turn sb-turn--user">
        <div class="sb-turn-body">
          <div class="sb-turn-content sb-turn-content--user">${escapeHtml(t.display || t.content)}</div>
        </div>
      </div>`;
  }
  const cursor = t.streaming ? '<span class="sb-cursor"></span>' : '';
  const body = t.loading
    ? `<div class="sb-skeleton"><div class="sb-skel-line" style="width:94%"></div><div class="sb-skel-line" style="width:78%"></div><div class="sb-skel-line" style="width:85%"></div></div>`
    : `${t.html || ''}${cursor}`;
  const action = t.action ? `<div class="sb-turn-action">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>
      <span>${t.action}</span>
    </div>` : '';
  const foot = (!t.loading && !t.streaming) ? `
    <div class="sb-turn-foot">
      <span class="sb-turn-model">
        <span class="dot" style="background:${(t.model || activeProviderInfo()).hue}"></span>
        ${(t.model || activeProviderInfo()).name}
      </span>
      <div class="sb-turn-foot-actions">
        <button class="sb-mini-btn" data-copy="${i}" title="Copy">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
        </button>
      </div>
    </div>` : '';
  return `
    <div class="sb-turn">
      <div class="sb-turn-avatar">
        <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
          <path d="M16 3c2 5 5.5 8.5 10.5 10.5C21.5 15.5 18 19 16 24 14 19 10.5 15.5 5.5 13.5 10.5 11.5 14 8 16 3z" fill="var(--accent)"/>
        </svg>
      </div>
      <div class="sb-turn-body">
        ${action}
        <div class="sb-turn-content">${body}</div>
        ${foot}
      </div>
    </div>`;
}

// ── Errors ─────────────────────────────────────────────────────────────
function showError(msg) {
  document.getElementById('error-message').textContent = msg;
  document.getElementById('error-state').style.display = 'block';
}

// ── Helpers ────────────────────────────────────────────────────────────
function getLanguageName() {
  const lang = settings.language;
  if (!lang || lang === 'auto') return '';
  const names = { en:'English', he:'Hebrew', es:'Spanish', fr:'French', de:'German', zh:'Chinese', ar:'Arabic', ja:'Japanese' };
  return names[lang] || '';
}
function truncate(t) {
  if (!t) return '';
  return t.length > 12000 ? t.slice(0, 12000) + '\n\n[truncated]' : t;
}
function ellipsis(t, n) { return t.length > n ? t.slice(0, n) + '…' : t; }
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Markdown renderer ──────────────────────────────────────────────────
function renderMarkdown(raw) {
  let text = escapeHtml(raw);
  text = text.replace(/```[\s\S]*?```/g, m => {
    const code = m.slice(3,-3).replace(/^[a-z]*\n/, '');
    return `<pre><code>${code}</code></pre>`;
  });
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
             .replace(/^### (.+)$/gm,  '<h4>$1</h4>')
             .replace(/^## (.+)$/gm,   '<h3>$1</h3>')
             .replace(/^# (.+)$/gm,    '<h2>$1</h2>');
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
             .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
             .replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = renderTables(text);
  text = text.replace(/^([ \t]*[-*•] .+(\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^[ \t]*[-*•] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  text = text.replace(/^([ \t]*\d+\. .+(\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l => `<li>${l.replace(/^[ \t]*\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });
  text = '<p>' + text.replace(/\n\n+/g, '</p><p>') + '</p>';
  text = text.replace(/<p><\/p>/g, '');
  text = text.split('\n').map(line => /^<[a-z/]/.test(line.trim()) ? line : line + '<br>').join('\n');
  text = text.replace(/<p>(<(?:h[1-6]|ul|ol|table|pre)[^>]*>)/g, '$1')
             .replace(/(<\/(?:h[1-6]|ul|ol|table|pre)>)<\/p>/g, '$1');
  return text;
}
function renderTables(text) {
  return text.replace(/((\|.+\|\n)+)/g, m => {
    const rows = m.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return m;
    const isSep = (r) => /^\|[-| :]+\|$/.test(r.trim());
    let html = '<table><thead>'; let inHead = true;
    for (const row of rows) {
      if (isSep(row)) { html += '</thead><tbody>'; inHead = false; continue; }
      const cells = row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
      const tag = inHead ? 'th' : 'td';
      html += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
    }
    html += inHead ? '' : '</tbody>';
    html += '</table>';
    return html;
  });
}

// Direction is applied via the SIDEBAR_OPENED message from content.js —
// the iframe cannot read window.parent.document directly (cross-origin).

init();
