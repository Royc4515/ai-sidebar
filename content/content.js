/**
 * Content script — injects the sidebar iframe into the host page and
 * proxies messages between the iframe and the page.
 */
(() => {
  if (window.__asideInjected) return;
  window.__asideInjected = true;

  const HOST_ID = 'aside-sidebar-host';
  const IFRAME_ID = 'aside-sidebar-frame';
  const TRIGGER_ID = 'aside-selection-trigger';
  let visible = false;

  function getStoredPosition() {
    try { return localStorage.getItem('aside.position') || 'right'; } catch { return 'right'; }
  }
  function getStoredWidth() {
    try { return parseInt(localStorage.getItem('aside.width'), 10) || 420; } catch { return 420; }
  }

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-aside-position', getStoredPosition());
    host.style.setProperty('--aside-width', getStoredWidth() + 'px');
    const iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.src = chrome.runtime.getURL('sidebar/sidebar.html');
    iframe.allow = 'clipboard-read; clipboard-write';
    host.appendChild(iframe);
    document.documentElement.appendChild(host);
    return host;
  }

  function show() {
    const host = ensureHost();
    host.classList.add('is-visible');
    visible = true;
    document.documentElement.classList.add('aside-open');
    hideTrigger();
    // Prime the iframe with current state.
    setTimeout(() => {
      const iframe = document.getElementById(IFRAME_ID);
      if (!iframe) return;
      iframe.contentWindow?.postMessage({ type: 'SIDEBAR_OPENED', dir: document.documentElement.dir || 'ltr' }, '*');
      sendPageContent();
      sendSelectedText();
    }, 200);
  }

  function hide() {
    const host = document.getElementById(HOST_ID);
    if (host) host.classList.remove('is-visible');
    document.documentElement.classList.remove('aside-open');
    visible = false;
  }

  function toggle() { (visible ? hide : show)(); }

  // Floating Trigger Button
  function createTrigger() {
    let btn = document.getElementById(TRIGGER_ID);
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = TRIGGER_ID;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
        <path d="M16 3c2 5 5.5 8.5 10.5 10.5C21.5 15.5 18 19 16 24 14 19 10.5 15.5 5.5 13.5 10.5 11.5 14 8 16 3z" fill="white"/>
      </svg>
    `;
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = getSelectedText();
      show();
      setTimeout(() => {
        const iframe = document.getElementById(IFRAME_ID);
        iframe?.contentWindow?.postMessage({ type: 'SELECTION_TRIGGER', text }, '*');
      }, 250);
    };
    document.body.appendChild(btn);
    return btn;
  }

  function positionTrigger() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      hideTrigger();
      return;
    }
    if (visible) return;

    try {
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      if (rects.length === 0) {
        hideTrigger();
        return;
      }

      const lastRect = rects[rects.length - 1];
      const btn = createTrigger();
      
      // Position relative to the viewport + scroll
      const x = lastRect.right + window.scrollX + 10;
      const y = lastRect.bottom + window.scrollY + 10;
      
      btn.style.left = `${x}px`;
      btn.style.top = `${y}px`;
      btn.classList.add('is-active');
    } catch (e) {
      hideTrigger();
    }
  }

  function hideTrigger() {
    const btn = document.getElementById(TRIGGER_ID);
    if (btn) {
      btn.classList.remove('is-active');
      // Briefly keep it in DOM but inactive
    }
  }

  // Page text extraction — prefer <article>/<main>, fallback to body.
  function extractPageContent() {
    const candidates = ['article', 'main', '[role="main"]', '#content', '.content'];
    let root = null;
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.length > 200) { root = el; break; }
    }
    root = root || document.body;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script, style, nav, footer, aside, [aria-hidden="true"]').forEach(n => n.remove());
    let text = (clone.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 30000) text = text.slice(0, 30000) + '\n\n[truncated]';
    return text;
  }

  function getSelectedText() {
    const sel = window.getSelection();
    return sel ? String(sel).trim() : '';
  }

  function sendPageContent() {
    const iframe = document.getElementById(IFRAME_ID);
    if (!iframe) return;
    iframe.contentWindow?.postMessage({ type: 'PAGE_CONTENT', content: extractPageContent() }, '*');
  }

  function sendSelectedText() {
    const iframe = document.getElementById(IFRAME_ID);
    if (!iframe) return;
    iframe.contentWindow?.postMessage({ type: 'SELECTED_TEXT', text: getSelectedText() }, '*');
  }

  // Listeners
  document.addEventListener('mouseup', () => {
    setTimeout(positionTrigger, 10);
  });

  document.addEventListener('selectionchange', () => {
    if (!visible) return;
    sendSelectedText();
  });

  // Iframe → content script messages
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'CLOSE_SIDEBAR') hide();
    if (msg.type === 'REQUEST_PAGE_CONTENT') sendPageContent();
    if (msg.type === 'REQUEST_SELECTED_TEXT') sendSelectedText();
    if (msg.type === 'SET_POSITION') {
      const host = document.getElementById(HOST_ID);
      if (host) host.setAttribute('data-aside-position', msg.position || 'right');
      try { localStorage.setItem('aside.position', msg.position || 'right'); } catch {}
    }
    if (msg.type === 'SET_WIDTH') {
      const host = document.getElementById(HOST_ID);
      const w = Math.max(320, Math.min(720, +msg.width || 420));
      if (host) host.style.setProperty('--aside-width', w + 'px');
      try { localStorage.setItem('aside.width', String(w)); } catch {}
    }
  });

  // Background → content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'TOGGLE_SIDEBAR') toggle();
    if (msg?.type === 'CONTEXT_MENU_ACTION') {
      if (!visible) show();
      setTimeout(() => {
        const iframe = document.getElementById(IFRAME_ID);
        iframe?.contentWindow?.postMessage(msg, '*');
      }, visible ? 0 : 500);
    }
  });
})();
