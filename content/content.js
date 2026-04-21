/**
 * content.js — injected into every page.
 * Responsibilities:
 *   1. Inject the sidebar iframe
 *   2. Show/hide sidebar (keyboard shortcut relay, popup relay)
 *   3. Detect text selection → show floating action button
 *   4. Extract page content
 *   5. Relay data to/from the sidebar iframe via postMessage
 */

(function () {
  // Guard against double-injection
  if (window.__aiSidebarLoaded) return;
  window.__aiSidebarLoaded = true;

  // ── Constants ────────────────────────────────────────────────────────────

  const CONTENT_MAX_CHARS  = 12000;
  const SELECTION_MIN_CHARS = 10;

  // ── State ────────────────────────────────────────────────────────────────

  let frame        = null;   // The sidebar <iframe>
  let floatBtn     = null;   // The floating selection button
  let selectedText = '';
  let sidebarOpen  = false;
  let lastMouseX   = 0;      // Last mouseup cursor position (fallback for float btn)
  let lastMouseY   = 0;

  // ── Sidebar iframe ────────────────────────────────────────────────────────

  function ensureFrame() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.id  = 'ai-sidebar-frame';
    frame.src = chrome.runtime.getURL('sidebar/sidebar.html');
    frame.setAttribute('aria-label', 'AI Sidebar');
    frame.setAttribute('frameborder', '0');
    document.documentElement.appendChild(frame);
    applyPosition();
    frame.addEventListener('load', () => {
      notifyFrame({ type: 'SIDEBAR_OPENED' });
      sendPageContent();
      if (selectedText) sendSelectedText();
    });
  }

  async function applyPosition() {
    const s = await chrome.storage.sync.get(['sidebarPosition', 'sidebarWidth']);
    const pos   = s.sidebarPosition || 'right';
    const width = Math.min(Math.max(s.sidebarWidth || 380, 280), 600);
    frame.style.width = width + 'px';
    if (pos === 'left') {
      frame.classList.add('ai-sidebar-left');
      frame.classList.remove('ai-sidebar-right');
    } else {
      frame.classList.add('ai-sidebar-right');
      frame.classList.remove('ai-sidebar-left');
    }
  }

  function openSidebar() {
    ensureFrame();
    if (!sidebarOpen) {
      frame.classList.add('ai-sidebar-open');
      sidebarOpen = true;
      notifyFrame({ type: 'SIDEBAR_OPENED' });
      sendPageContent();
      if (selectedText) sendSelectedText();
    }
  }

  function closeSidebar() {
    if (frame && sidebarOpen) {
      frame.classList.remove('ai-sidebar-open');
      sidebarOpen = false;
    }
  }

  function toggleSidebar() {
    sidebarOpen ? closeSidebar() : openSidebar();
  }

  // ── Page content extraction ───────────────────────────────────────────────

  function extractPageContent() {
    const candidates = [
      'article', 'main', '[role="main"]',
      '.article-body', '.post-content', '.entry-content', '#content', '.content'
    ];

    let el = null;
    for (const sel of candidates) {
      el = document.querySelector(sel);
      if (el) break;
    }
    el = el || document.body;

    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, nav, header, footer, aside, [aria-hidden]')
      .forEach(n => n.remove());

    const text = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();

    if (text.length > CONTENT_MAX_CHARS) {
      return text.substring(0, CONTENT_MAX_CHARS) + '\n\n[Content truncated to fit context window]';
    }
    return text;
  }

  function sendPageContent() {
    notifyFrame({ type: 'PAGE_CONTENT', content: extractPageContent() });
  }

  function sendSelectedText() {
    notifyFrame({ type: 'SELECTED_TEXT', text: selectedText });
  }

  function notifyFrame(msg) {
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(msg, '*');
    }
  }

  // ── Message relay: service worker / popup → sidebar ───────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_SIDEBAR') toggleSidebar();
    if (msg.type === 'OPEN_SIDEBAR')   openSidebar();

    if (msg.type === 'CONTEXT_MENU_ACTION') {
      if (msg.text) selectedText = msg.text;
      const wasOpen = sidebarOpen;
      openSidebar();
      // If sidebar was already open, trigger immediately; otherwise wait for iframe load
      setTimeout(() => {
        if (msg.text) sendSelectedText();
        notifyFrame({ type: 'TRIGGER_ACTION', action: msg.action });
      }, wasOpen ? 0 : 400);
    }
  });

  // ── Message relay: sidebar iframe → page ──────────────────────────────────

  window.addEventListener('message', (event) => {
    if (!frame || event.source !== frame.contentWindow) return;

    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'CLOSE_SIDEBAR':         closeSidebar();     break;
      case 'REQUEST_PAGE_CONTENT':  sendPageContent();  break;
      case 'REQUEST_SELECTED_TEXT': sendSelectedText(); break;
    }
  });

  // ── Text selection → floating button ──────────────────────────────────────

  document.addEventListener('mouseup', (e) => {
    // Capture cursor position for float button fallback placement
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (frame && frame.contains(e.target)) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : '';

      if (text.length > SELECTION_MIN_CHARS) {
        selectedText = text;
        showFloatBtn(selection);
        if (sidebarOpen) sendSelectedText();
      } else if (!e.target.closest('#ai-sidebar-float-btn')) {
        selectedText = '';
        hideFloatBtn();
      }
    }, 10);
  });

  function showFloatBtn(selection) {
    if (!floatBtn) {
      floatBtn = document.createElement('button');
      floatBtn.id = 'ai-sidebar-float-btn';
      floatBtn.innerHTML = '✨ <span>AI</span>';
      floatBtn.title     = 'Open AI Sidebar';
      floatBtn.addEventListener('click', () => {
        openSidebar();
        hideFloatBtn();
      });
      document.documentElement.appendChild(floatBtn);
    }

    try {
      const range = selection.getRangeAt(0);
      const rect  = range.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      // Guard against zero rects (selection in nested iframe or shadow DOM)
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        // Fall back to last known mouse cursor position
        const top  = Math.min(lastMouseY + scrollY + 6, scrollY + window.innerHeight - 40);
        const left = Math.min(lastMouseX + scrollX, scrollX + window.innerWidth - 80);
        floatBtn.style.top  = top + 'px';
        floatBtn.style.left = left + 'px';
        floatBtn.style.display = 'flex';
        return;
      }

      let top  = scrollY + rect.bottom + 6;
      let left = scrollX + rect.left;
      // Clamp to viewport bounds
      if (left > scrollX + window.innerWidth - 80) left = scrollX + window.innerWidth - 80;
      if (top  > scrollY + window.innerHeight - 40) top  = scrollY + window.innerHeight - 40;

      floatBtn.style.top  = top + 'px';
      floatBtn.style.left = left + 'px';
    } catch (_) {
      floatBtn.style.display = 'none';
      return;
    }

    floatBtn.style.display = 'flex';
  }

  function hideFloatBtn() {
    if (floatBtn) floatBtn.style.display = 'none';
  }

  document.addEventListener('mousedown', (e) => {
    if (floatBtn && !floatBtn.contains(e.target)) hideFloatBtn();
  });

  document.addEventListener('scroll', hideFloatBtn, { passive: true });

})();
