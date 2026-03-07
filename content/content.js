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

  // ── State ────────────────────────────────────────────────────────────────

  let frame       = null;   // The sidebar <iframe>
  let floatBtn    = null;   // The floating selection button
  let selectedText = '';
  let sidebarOpen  = false;

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
      // Send current selection + fresh page content on load
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
    // Prefer semantic content elements
    const candidates = [
      'article',
      'main',
      '[role="main"]',
      '.article-body',
      '.post-content',
      '.entry-content',
      '#content',
      '.content'
    ];

    let el = null;
    for (const sel of candidates) {
      el = document.querySelector(sel);
      if (el) break;
    }
    el = el || document.body;

    // Clone and strip scripts/styles
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, nav, header, footer, aside, [aria-hidden]')
      .forEach(n => n.remove());

    const text = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();

    // Truncate to ~3000 tokens (≈12,000 chars) — edge case from plan section 6
    if (text.length > 12000) {
      return text.substring(0, 12000) + '\n\n[Content truncated to fit context window]';
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
  });

  // ── Message relay: sidebar iframe → page ──────────────────────────────────

  window.addEventListener('message', (event) => {
    // Only trust messages from our own sidebar frame
    if (!frame || event.source !== frame.contentWindow) return;

    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'CLOSE_SIDEBAR':
        closeSidebar();
        break;
      case 'REQUEST_PAGE_CONTENT':
        sendPageContent();
        break;
      case 'REQUEST_SELECTED_TEXT':
        sendSelectedText();
        break;
    }
  });

  // ── Text selection → floating button ──────────────────────────────────────

  document.addEventListener('mouseup', (e) => {
    // Don't trigger inside our sidebar
    if (frame && frame.contains(e.target)) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : '';

      if (text.length > 10) {
        selectedText = text;
        showFloatBtn(selection);
        // Also relay to sidebar if open
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

      // Position below selection, clamped to viewport
      let top  = scrollY + rect.bottom + 6;
      let left = scrollX + rect.left;
      const maxLeft = scrollX + window.innerWidth - 80;
      if (left > maxLeft) left = maxLeft;

      floatBtn.style.top  = top + 'px';
      floatBtn.style.left = left + 'px';
    } catch (_) {}

    floatBtn.style.display = 'flex';
  }

  function hideFloatBtn() {
    if (floatBtn) floatBtn.style.display = 'none';
  }

  // Hide float button on scroll/click-elsewhere
  document.addEventListener('mousedown', (e) => {
    if (floatBtn && !floatBtn.contains(e.target)) hideFloatBtn();
  });

  document.addEventListener('scroll', hideFloatBtn, { passive: true });

})();
