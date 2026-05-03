/**
 * Tiny i18n helper used by sidebar.html.
 * Replaces text on elements with [data-i18n] / [data-i18n-placeholder].
 */
(function () {
  function t(key) {
    try {
      return chrome.i18n.getMessage(key) || '';
    } catch { return ''; }
  }
  function applyI18n(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const v = t(el.dataset.i18n); if (v) el.textContent = v;
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const v = t(el.dataset.i18nPlaceholder); if (v) el.placeholder = v;
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
      const v = t(el.dataset.i18nTitle); if (v) el.title = v;
    });
    // Direction
    try {
      const lang = chrome.i18n.getUILanguage();
      if (/^(he|ar|fa|ur)/i.test(lang)) document.documentElement.dir = 'rtl';
    } catch {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyI18n());
  } else {
    applyI18n();
  }
  window.applyI18n = applyI18n;
})();
