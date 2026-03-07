/**
 * Sidebar — main logic layer.
 * Runs inside the extension iframe injected by content.js.
 * Responsible for: action dispatch, provider calls, UI state, postMessage relay.
 */

// ── State ──────────────────────────────────────────────────────────────────

let settings       = {};
let provider       = null;
let selectedText   = '';
let pageContent    = '';
let lastAction     = null;
let lastPromptArgs = null;

// ── Action templates (pure functions, per plan section 2.4) ───────────────

const ACTIONS = {
  explain:   (text)       => `Explain the following clearly and concisely:\n\n"${text}"`,
  summarize: (page)       => `Summarize this page in concise key bullet points:\n\n${page}`,
  ask:       (q, page)    => `Based on the following page content, answer this question: ${q}`,
  reply:     (text)       => `Suggest exactly 3 short, distinct reply options to the following message. Number them 1, 2, 3:\n\n"${text}"`,
  extract:   (page)       => `Extract all structured data from the page below as a markdown table with clear headers:\n\n${page}`
};

// Action display labels
const ACTION_LABELS = {
  explain: 'Explanation', summarize: 'Summary',
  ask: 'Answer', reply: 'Reply suggestions', extract: 'Extracted data'
};

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  await loadSettings();
  bindUI();
  requestPageContent();
}

async function loadSettings() {
  settings = await chrome.storage.sync.get([
    'activeProvider', 'apiKeys', 'language'
  ]);
  settings.apiKeys = settings.apiKeys || {};
  updateProviderBadge();

  if (!settings.activeProvider || !settings.apiKeys[settings.activeProvider]) {
    if (settings.activeProvider !== 'ollama') {
      showOnboarding();
      return;
    }
  }

  try {
    provider = ProviderFactory.get(settings.activeProvider, settings.apiKeys);
    hideOnboarding();
  } catch (e) {
    showOnboarding();
  }
}

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
  // Action buttons (Summarize, Extract, Explain, Reply)
  document.querySelectorAll('.action-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action));
  });

  // Ask button + Enter key
  document.getElementById('ask-btn').addEventListener('click', handleAsk);
  document.getElementById('ask-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  });

  // Close
  document.getElementById('close-btn').addEventListener('click', () => {
    window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
  });

  // Settings
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Onboarding settings button
  const onboardingBtn = document.getElementById('onboarding-settings-btn');
  if (onboardingBtn) {
    onboardingBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }

  // Copy button
  document.getElementById('copy-btn').addEventListener('click', copyResponse);

  // Retry button
  document.getElementById('retry-btn').addEventListener('click', () => {
    if (lastAction && lastPromptArgs) runPrompt(...lastPromptArgs);
  });
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
    // Re-request fresh content when sidebar opens
    requestPageContent();
    window.parent.postMessage({ type: 'REQUEST_SELECTED_TEXT' }, '*');
  }
});

function updateSelectionUI() {
  const section  = document.getElementById('selection-section');
  const preview  = document.getElementById('selected-preview');
  if (selectedText && selectedText.length > 0) {
    section.style.display = 'block';
    preview.textContent   = selectedText.length > 200
      ? selectedText.substring(0, 200) + '…'
      : selectedText;
  } else {
    section.style.display = 'none';
  }
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
      prompt  = ACTIONS.summarize(truncate(pageContent));
      context = null;
      break;

    case 'extract':
      if (!pageContent) { showError('Could not extract page content. Try reloading the page.'); return; }
      prompt  = ACTIONS.extract(truncate(pageContent));
      context = null;
      break;

    default:
      showError(`Unknown action: ${action}`);
      return;
  }

  lastAction     = action;
  lastPromptArgs = [prompt, context, action];
  await runPrompt(prompt, context, action);
}

async function handleAsk() {
  if (!provider) { showOnboarding(); return; }
  const q = document.getElementById('ask-input').value.trim();
  if (!q) return;

  const prompt  = ACTIONS.ask(q, truncate(pageContent));
  const context = truncate(pageContent);

  lastAction     = 'ask';
  lastPromptArgs = [prompt, context, 'ask'];
  await runPrompt(prompt, context, 'ask');
}

// ── Core prompt runner ─────────────────────────────────────────────────────

async function runPrompt(prompt, context, action) {
  showLoading(action);
  try {
    const langSuffix = getLanguageSuffix();
    const fullPrompt = langSuffix ? `${prompt}\n\n${langSuffix}` : prompt;
    const response   = await provider.complete(fullPrompt, context);
    showResponse(response, action);
  } catch (err) {
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

// ── Truncate page content to ~3000 tokens ─────────────────────────────────

function truncate(text) {
  if (!text) return '';
  if (text.length > 12000) {
    return text.substring(0, 12000) + '\n\n[Content truncated — showing first ~3000 tokens]';
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
  document.getElementById('response-body').innerHTML = renderMarkdown(text);
  show('response-content');
}

function showError(message) {
  hide('loading-state');
  hide('response-content');
  hide('response-placeholder');
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
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
  });
}

// ── Simple markdown renderer ───────────────────────────────────────────────

function renderMarkdown(raw) {
  // Escape HTML first (trust but verify — provider output may contain HTML)
  let text = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

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

  // Tables (simple — pipe-separated lines)
  text = renderTables(text);

  // Unordered lists
  text = text.replace(/^([ \t]*[-*•] .+(\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l =>
      `<li>${l.replace(/^[ \t]*[-*•] /, '')}</li>`
    ).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists (numbered)
  text = text.replace(/^([ \t]*\d+\. .+(\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l =>
      `<li>${l.replace(/^[ \t]*\d+\. /, '')}</li>`
    ).join('');
    return `<ol>${items}</ol>`;
  });

  // Paragraphs (double newline → paragraph break)
  text = text.replace(/\n\n+/g, '</p><p>');
  text = '<p>' + text + '</p>';
  text = text.replace(/<p><\/p>/g, '');

  // Single newlines within paragraphs (line-by-line — avoids lookbehind for iframe compat)
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
      let html = '<table>';
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
init();
