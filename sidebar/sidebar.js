/**
 * Sidebar — main logic layer.
 * Runs inside the extension iframe injected by content.js.
 * Responsible for: action dispatch, provider calls, UI state, postMessage relay.
 */

// ── Constants ──────────────────────────────────────────────────────────────

const CONSTANTS = {
  PAGE_CONTENT_MAX_CHARS:    12000,
  SELECTION_PREVIEW_MAX_CHARS: 200,
  COPY_FEEDBACK_MS:          2000,
  HISTORY_MAX_ITEMS:           20,
  CONV_MAX_MESSAGES:           40,
};

// ── State ──────────────────────────────────────────────────────────────────

let settings       = {};
let provider       = null;
let selectedText   = '';
let pageContent    = '';
let lastAction     = null;
let lastPromptArgs = null;

// Conversation history (multi-turn ask turns only)
let conversationHistory = [];
const HISTORY_STORAGE_KEY = 'ai-sidebar-history';

// One-shot response history (summarize, explain, extract, reply)
let responseHistory = [];
const RESPONSE_HISTORY_KEY = 'ai-sidebar-response-history';

// ── Action templates ───────────────────────────────────────────────────────

const ACTIONS = {
  explain:   (text)    => `Explain the following clearly and concisely:\n\n"${text}"`,
  summarize: (page)    => `Summarize this page in concise key bullet points:\n\n${page}`,
  ask:       (q, page) => page
    ? `Based on the following page content, answer this question: ${q}\n\nPage content:\n${page}`
    : q,
  reply:     (text)    => `Suggest exactly 3 short, distinct reply options to the following message. Number them 1, 2, 3:\n\n"${text}"`,
  extract:   (page)    => `Extract all structured data from the page below as a markdown table with clear headers:\n\n${page}`
};

const ACTION_LABELS = {
  explain: 'Explanation', summarize: 'Summary',
  ask: 'Answer', reply: 'Reply suggestions', extract: 'Extracted data'
};

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  await loadSettings();
  bindUI();
  requestPageContent();
  loadHistory();
  loadResponseHistory();
}

function applyTheme(theme) {
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : (theme || 'dark');
  document.documentElement.dataset.theme = resolved;
}

async function loadSettings() {
  settings = await chrome.storage.sync.get([
    'activeProvider', 'apiKeys', 'language', 'selectedModels', 'theme', 'customPrompts'
  ]);
  settings.apiKeys        = settings.apiKeys        || {};
  settings.selectedModels = settings.selectedModels || {};
  settings.customPrompts  = settings.customPrompts  || {};

  applyTheme(settings.theme || 'dark');

  // Merge any custom prompt templates over the defaults
  const cp = settings.customPrompts;
  if (cp.explain)   ACTIONS.explain   = (text) => cp.explain.replace('{{text}}', text);
  if (cp.summarize) ACTIONS.summarize = (page) => cp.summarize.replace('{{page}}', page);
  if (cp.reply)     ACTIONS.reply     = (text) => cp.reply.replace('{{text}}', text);
  if (cp.extract)   ACTIONS.extract   = (page) => cp.extract.replace('{{page}}', page);

  updateProviderBadge();

  if (!settings.activeProvider || !settings.apiKeys[settings.activeProvider]) {
    if (settings.activeProvider !== 'ollama') {
      showOnboarding();
      return;
    }
  }

  try {
    provider = ProviderFactory.get(settings.activeProvider, settings.apiKeys, settings.selectedModels);
    hideOnboarding();
  } catch (e) {
    showOnboarding();
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.theme) applyTheme(changes.theme.newValue);
});

function updateProviderBadge() {
  const badge = document.getElementById('provider-badge');
  const labels = {
    claude: 'Claude', gemini: 'Gemini', openai: 'GPT-4o',
    grok: 'Grok', groq: 'Groq', ollama: 'Ollama'
  };
  badge.textContent = labels[settings.activeProvider] || '—';
}

// ── UI binding ─────────────────────────────────────────────────────────────

function bindUI() {
  document.querySelectorAll('.action-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action));
  });

  document.getElementById('ask-btn').addEventListener('click', handleAsk);
  document.getElementById('ask-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  });

  document.getElementById('close-btn').addEventListener('click', () => {
    window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  const onboardingBtn = document.getElementById('onboarding-settings-btn');
  if (onboardingBtn) {
    onboardingBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  document.getElementById('copy-btn').addEventListener('click', copyResponse);

  document.getElementById('retry-btn').addEventListener('click', () => {
    if (lastAction && lastPromptArgs) runPrompt(...lastPromptArgs);
  });

  document.getElementById('new-chat-btn').addEventListener('click', () => {
    if (confirm('Start a new conversation? This will clear the current history.')) {
      clearHistory();
      hide('response-content');
      hide('error-state');
      show('response-placeholder');
    }
  });

  document.getElementById('history-toggle').addEventListener('click', toggleHistoryPanel);
}

// ── Onboarding helpers ─────────────────────────────────────────────────────

function showOnboarding() {
  document.getElementById('onboarding').style.display = 'flex';
  document.getElementById('main-content').style.display = 'none';
}

function hideOnboarding() {
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('main-content').style.display = 'flex';
}

// ── Page content / selection via postMessage ───────────────────────────────

function requestPageContent() {
  window.parent.postMessage({ type: 'REQUEST_PAGE_CONTENT' }, '*');
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'PAGE_CONTENT') {
    pageContent = msg.content || '';
  }

  if (msg.type === 'SELECTED_TEXT') {
    selectedText = msg.text || '';
    updateSelectionUI();
  }

  if (msg.type === 'SIDEBAR_OPENED') {
    requestPageContent();
    window.parent.postMessage({ type: 'REQUEST_SELECTED_TEXT' }, '*');
  }

  if (msg.type === 'TRIGGER_ACTION') {
    // Small delay lets PAGE_CONTENT and SELECTED_TEXT arrive first
    setTimeout(() => handleAction(msg.action), 50);
  }
});

function updateSelectionUI() {
  const section = document.getElementById('selection-section');
  const preview = document.getElementById('selected-preview');
  if (selectedText && selectedText.length > 0) {
    section.style.display = 'block';
    // Use textContent — user-supplied text, must not be rendered as HTML
    preview.textContent = selectedText.length > CONSTANTS.SELECTION_PREVIEW_MAX_CHARS
      ? selectedText.substring(0, CONSTANTS.SELECTION_PREVIEW_MAX_CHARS) + '…'
      : selectedText;
  } else {
    section.style.display = 'none';
  }
}

// ── Conversation history ───────────────────────────────────────────────────

function loadHistory() {
  try {
    const stored = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    conversationHistory = stored ? JSON.parse(stored) : [];
  } catch (_) {
    conversationHistory = [];
  }
  renderConversation();
}

function saveHistory() {
  try {
    const trimmed = conversationHistory.slice(-CONSTANTS.CONV_MAX_MESSAGES);
    conversationHistory = trimmed;
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (_) {}
}

function addToHistory(role, displayContent, apiContent, action) {
  conversationHistory.push({ role, displayContent, apiContent, action, timestamp: Date.now() });
  saveHistory();
}

function clearHistory() {
  conversationHistory = [];
  sessionStorage.removeItem(HISTORY_STORAGE_KEY);
  renderConversation();
}

/** Returns {role, content} pairs from prior ask turns, for the API messages array. */
function buildApiHistory() {
  return conversationHistory
    .filter(m => m.action === 'ask')
    .map(m => ({ role: m.role, content: m.apiContent || m.displayContent }));
}

function renderConversation() {
  const section = document.getElementById('conversation-section');
  const history = document.getElementById('conversation-history');

  if (!conversationHistory.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  history.innerHTML = '';

  for (const msg of conversationHistory) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${msg.role}`;
    if (msg.role === 'user') {
      bubble.textContent = msg.displayContent;
    } else {
      bubble.innerHTML = sanitizeHTML(renderMarkdown(msg.displayContent));
    }
    history.appendChild(bubble);
  }

  history.scrollTop = history.scrollHeight;
}

// ── Response history (one-shot actions) ───────────────────────────────────

function loadResponseHistory() {
  try {
    const stored = sessionStorage.getItem(RESPONSE_HISTORY_KEY);
    responseHistory = stored ? JSON.parse(stored) : [];
  } catch (_) {
    responseHistory = [];
  }
  renderHistoryPanel();
}

function saveToResponseHistory(action, text) {
  responseHistory.unshift({ action, label: ACTION_LABELS[action] || action, text, timestamp: Date.now() });
  if (responseHistory.length > CONSTANTS.HISTORY_MAX_ITEMS) {
    responseHistory = responseHistory.slice(0, CONSTANTS.HISTORY_MAX_ITEMS);
  }
  try {
    sessionStorage.setItem(RESPONSE_HISTORY_KEY, JSON.stringify(responseHistory));
  } catch (_) {}
}

function renderHistoryPanel() {
  const panel = document.getElementById('history-panel');
  const count = document.getElementById('history-count');
  if (!responseHistory.length) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  count.textContent = responseHistory.length;
}

function toggleHistoryPanel() {
  const list  = document.getElementById('history-list');
  const arrow = document.getElementById('history-arrow');
  const isOpen = list.style.display !== 'none';
  if (isOpen) {
    list.style.display = 'none';
    arrow.textContent  = '▾';
  } else {
    renderHistoryList();
    list.style.display = 'block';
    arrow.textContent  = '▴';
  }
}

function renderHistoryList() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  for (const item of responseHistory) {
    const el = document.createElement('div');
    el.className = 'history-item';
    const preview = item.text.substring(0, 100).replace(/\n/g, ' ');
    el.innerHTML = `
      <div class="history-item-header">
        <span class="history-item-label">${sanitizeText(item.label)}</span>
        <span class="history-item-time">${formatTimeAgo(item.timestamp)}</span>
      </div>
      <div class="history-item-preview">${sanitizeText(preview)}${item.text.length > 100 ? '…' : ''}</div>
    `;
    el.addEventListener('click', () => showResponse(item.text, item.action));
    list.appendChild(el);
  }
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000)   return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

// ── Action handlers ────────────────────────────────────────────────────────

async function handleAction(action) {
  if (!provider) { showOnboarding(); return; }

  let prompt, context;

  switch (action) {
    case 'explain':
      if (!selectedText) { showError('Select some text first, then click Explain.'); return; }
      prompt  = ACTIONS.explain(selectedText);
      context = null;
      break;

    case 'reply':
      if (!selectedText) { showError('Select some text first, then click Reply.'); return; }
      prompt  = ACTIONS.reply(selectedText);
      context = null;
      break;

    case 'summarize':
      if (!pageContent) { showError('Could not extract page content. Try reloading the page.'); return; }
      prompt  = ACTIONS.summarize(pageContent);
      context = null;
      break;

    case 'extract':
      if (!pageContent) { showError('Could not extract page content. Try reloading the page.'); return; }
      prompt  = ACTIONS.extract(pageContent);
      context = null;
      break;

    default:
      showError(`Unknown action: ${action}`);
      return;
  }

  lastAction     = action;
  lastPromptArgs = [prompt, context, action, null, []];
  await runPrompt(prompt, context, action, null, []);
}

async function handleAsk() {
  if (!provider) { showOnboarding(); return; }
  const q = document.getElementById('ask-input').value.trim();
  if (!q || q.length < 2) { showError('Please enter a question.'); return; }

  const rawQuestion = q;
  // Build API history snapshot BEFORE adding current message
  const apiHistory  = buildApiHistory();
  const fullPrompt  = ACTIONS.ask(q, truncate(pageContent));

  document.getElementById('ask-input').value = '';

  lastAction     = 'ask';
  lastPromptArgs = [fullPrompt, null, 'ask', rawQuestion, apiHistory];
  await runPrompt(fullPrompt, null, 'ask', rawQuestion, apiHistory);
}

// ── Core prompt runner (streaming + history aware) ─────────────────────────

async function runPrompt(prompt, context, action, rawUserInput, apiHistory = []) {
  showLoading(action);

  const isConversational = (action === 'ask') && rawUserInput;

  // Optimistically add user turn to display history
  if (isConversational) {
    addToHistory('user', rawUserInput, rawUserInput, 'ask');
    renderConversation();
  }

  let accumulated = '';
  let rafId       = null;

  function onChunk(delta) {
    accumulated += delta;
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const body = document.getElementById('response-body');
        if (body) {
          body.innerHTML  = sanitizeHTML(renderMarkdown(accumulated));
          body.scrollTop  = body.scrollHeight;
        }
        // Transition from loading → streaming response on first chunk
        hide('loading-state');
        hide('response-placeholder');
        hide('error-state');
        document.getElementById('response-action-label').textContent =
          ACTION_LABELS[action] || action;
        show('response-content');
      });
    }
  }

  try {
    const langSuffix  = getLanguageSuffix();
    const fullPrompt  = langSuffix ? `${prompt}\n\n${langSuffix}` : prompt;
    const fullText    = await provider.completeStream(fullPrompt, context, onChunk, apiHistory);

    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    showResponse(fullText, action);

    if (isConversational) {
      addToHistory('assistant', fullText, fullText, 'ask');
      renderConversation();
    } else {
      saveToResponseHistory(action, fullText);
      renderHistoryPanel();
    }
  } catch (err) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    // Roll back the optimistically-added user message
    if (isConversational && conversationHistory.length > 0 &&
        conversationHistory[conversationHistory.length - 1].role === 'user') {
      conversationHistory.pop();
      saveHistory();
      renderConversation();
    }

    showError(err.message || 'An unexpected error occurred.');
  }
}

function getLanguageSuffix() {
  const lang = settings.language;
  if (!lang || lang === 'auto') return '';
  const langNames = {
    en: 'English', he: 'Hebrew', es: 'Spanish',
    fr: 'French',  de: 'German', zh: 'Chinese',
    ar: 'Arabic',  ja: 'Japanese'
  };
  const name = langNames[lang];
  return name ? `Please respond in ${name}.` : '';
}

// ── Safety truncation (content.js already truncates; this is a guard) ─────

function truncate(text) {
  if (!text) return '';
  if (text.length > CONSTANTS.PAGE_CONTENT_MAX_CHARS) {
    return text.substring(0, CONSTANTS.PAGE_CONTENT_MAX_CHARS) + '\n\n[Content truncated]';
  }
  return text;
}

// ── UI state transitions ───────────────────────────────────────────────────

function showLoading(action) {
  hide('response-placeholder');
  hide('response-content');
  hide('error-state');
  show('loading-state');
  const label = ACTION_LABELS[action] || action;
  document.getElementById('loading-text').textContent = `Getting ${label.toLowerCase()}…`;
  document.getElementById('response-area').style.display = 'block';
}

function showResponse(text, action) {
  hide('loading-state');
  hide('response-placeholder');
  hide('error-state');
  document.getElementById('response-action-label').textContent = ACTION_LABELS[action] || action;
  document.getElementById('response-body').innerHTML = sanitizeHTML(renderMarkdown(text));
  show('response-content');
}

function showError(message) {
  hide('loading-state');
  hide('response-content');
  hide('response-placeholder');
  // Use textContent to avoid XSS in error messages
  document.getElementById('error-message').textContent = message;
  show('error-state');
}

function show(id) { document.getElementById(id).style.display = 'block'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

// ── Copy to clipboard ──────────────────────────────────────────────────────

function copyResponse() {
  const body    = document.getElementById('response-body');
  const text    = body.innerText || body.textContent;
  const copyBtn = document.getElementById('copy-btn');
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, CONSTANTS.COPY_FEEDBACK_MS);
  });
}

// ── HTML sanitizer (DOM-based, allowlist approach) ────────────────────────

/**
 * Sanitize an HTML string using the browser's own parser + DOM tree walk.
 * Strips disallowed elements/attributes. Safe against XSS in AI-generated content.
 */
function sanitizeHTML(html) {
  const ALLOWED_TAGS = new Set([
    'p', 'br', 'strong', 'em', 'b', 'i', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'hr', 'span', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'
  ]);

  const ALLOWED_ATTRS = {
    a:  ['href', 'title', 'target', 'rel'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  };

  const SAFE_URL_RE = /^(https?:|mailto:|#)/i;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tag = node.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: replace element with its children
      const frag = document.createDocumentFragment();
      for (const child of node.childNodes) {
        const cleaned = cleanNode(child);
        if (cleaned) frag.appendChild(cleaned);
      }
      return frag;
    }

    const el           = document.createElement(tag);
    const allowedAttrs = ALLOWED_ATTRS[tag] || [];

    for (const attr of allowedAttrs) {
      const val = node.getAttribute(attr);
      if (!val) continue;
      if (attr === 'href' && !SAFE_URL_RE.test(val.trim())) continue;
      el.setAttribute(attr, val);
    }

    if (tag === 'a') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }

    for (const child of node.childNodes) {
      const cleaned = cleanNode(child);
      if (cleaned) el.appendChild(cleaned);
    }

    return el;
  }

  const result  = document.createDocumentFragment();
  for (const child of doc.body.childNodes) {
    const cleaned = cleanNode(child);
    if (cleaned) result.appendChild(cleaned);
  }

  const wrapper = document.createElement('div');
  wrapper.appendChild(result);
  return wrapper.innerHTML;
}

/** Escape text for safe insertion into HTML attribute values or text nodes. */
function sanitizeText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Markdown renderer ──────────────────────────────────────────────────────

function renderMarkdown(raw) {
  // Step 1: Escape HTML entities
  let text = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Step 2: Markdown links — process BEFORE code blocks so URLs aren't code-escaped
  // At this point & in URLs is &amp; — decode it back for the href
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
    const safeUrl = url.replace(/&amp;/g, '&');
    if (!/^(https?:|mailto:)/i.test(safeUrl)) return `[${linkText}](${url})`;
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
  });

  // Code blocks (must be before inline code)
  text = text.replace(/```[\s\S]*?```/g, m => {
    const code = m.slice(3, -3).replace(/^[a-z]*\n/, '');
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^### (.+)$/gm,  '<h4>$1</h4>');
  text = text.replace(/^## (.+)$/gm,   '<h3>$1</h3>');
  text = text.replace(/^# (.+)$/gm,    '<h2>$1</h2>');

  // Bold / italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g,         '<em>$1</em>');

  // Tables
  text = renderTables(text);

  // Unordered lists
  text = text.replace(/^([ \t]*[-*•] .+(\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l =>
      `<li>${l.replace(/^[ \t]*[-*•] /, '')}</li>`
    ).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  text = text.replace(/^([ \t]*\d+\. .+(\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l =>
      `<li>${l.replace(/^[ \t]*\d+\. /, '')}</li>`
    ).join('');
    return `<ol>${items}</ol>`;
  });

  // Paragraphs
  text = text.replace(/\n\n+/g, '</p><p>');
  text = '<p>' + text + '</p>';
  text = text.replace(/<p><\/p>/g, '');

  // Single newlines within paragraphs
  text = text.split('\n').map(line =>
    /^<[a-z/]/.test(line.trim()) ? line : line + '<br>'
  ).join('\n');

  // Clean up paragraphs wrapping block elements
  text = text.replace(/<p>(<(?:h[1-6]|ul|ol|table|pre)[^>]*>)/g, '$1');
  text = text.replace(/(<\/(?:h[1-6]|ul|ol|table|pre)>)<\/p>/g, '$1');

  return text;
}

function renderTables(text) {
  return text.replace(
    /((\|.+\|\n)+)/g,
    match => {
      const rows = match.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2) return match;
      const isAlignRow = (r) => /^\|[-| :]+\|$/.test(r.trim());
      let html   = '<table>';
      let inHead = true;
      for (const row of rows) {
        if (isAlignRow(row)) { html += '</thead><tbody>'; inHead = false; continue; }
        const cells = row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
        const tag   = inHead ? 'th' : 'td';
        html += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
      }
      html += (inHead ? '' : '</tbody>') + '</table>';
      return html;
    }
  );
}

// ── Start ──────────────────────────────────────────────────────────────────

(async () => {
  try {
    await init();
  } catch (fatalErr) {
    try {
      document.body.innerHTML = `
        <div style="padding:24px;color:#f76a6a;font-family:sans-serif;font-size:13px;line-height:1.6">
          <strong>⚠ Sidebar failed to load</strong><br><br>
          ${sanitizeText(fatalErr.message || 'Unknown error')}<br><br>
          <button onclick="location.reload()"
                  style="margin-top:8px;padding:6px 14px;cursor:pointer;border:1px solid #f76a6a;background:none;color:#f76a6a;border-radius:6px">
            Reload
          </button>
        </div>`;
    } catch (_) {}
  }
})();
