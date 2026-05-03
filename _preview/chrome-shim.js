/**
 * chrome-shim.js — runs ONLY when the file is opened outside an extension.
 * Detects absence of the real chrome.runtime.id and provides mock implementations
 * backed by localStorage so the UI is interactive for design preview.
 */
(function () {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) return; // real extension

  const STORE_KEY = '__aside_storage__';
  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  }
  function writeStore(o) { localStorage.setItem(STORE_KEY, JSON.stringify(o)); }

  function get(keys) {
    const all = readStore();
    if (!keys) return Promise.resolve({ ...all });
    if (typeof keys === 'string') return Promise.resolve({ [keys]: all[keys] });
    if (Array.isArray(keys)) {
      const r = {}; keys.forEach(k => { r[k] = all[k]; }); return Promise.resolve(r);
    }
    if (typeof keys === 'object') {
      const r = {}; Object.keys(keys).forEach(k => { r[k] = (k in all) ? all[k] : keys[k]; }); return Promise.resolve(r);
    }
    return Promise.resolve({});
  }
  function set(items) {
    const all = readStore();
    Object.assign(all, items);
    writeStore(all);
    return Promise.resolve();
  }
  function clear() { writeStore({}); return Promise.resolve(); }

  const I18N = {
    en: {
      'tab-chat':'Chat','tab-tools':'Tools',
      'hero-title':'How can I help with this page?',
      'hero-sub':'Summarize, extract, translate, or ask anything. Page context is included automatically.',
      'selected-label':'Selected text','from-page':'From page',
      'tools-page':'Page actions','tools-selection':'Selection actions',
      'composer-placeholder':'Ask anything about this page…',
      'foot-note':'Aside can make mistakes. Check important info.',
      'onboarding-title':'Set up your AI',
      'onboarding-sub':'Pick a provider (Claude, Gemini, Groq, etc.) and add your API key. Keys stay on your device.',
      'onboarding-cta':'Open Settings',
      'error-title':'Something went wrong','retry':'Try again',
    },
    he: {
      'tab-chat':'צ׳אט','tab-tools':'כלים',
      'hero-title':'איך אפשר לעזור עם העמוד הזה?',
      'hero-sub':'סכמו, חלצו, תרגמו, או שאלו כל דבר. תוכן העמוד נכלל אוטומטית.',
      'selected-label':'טקסט נבחר','from-page':'מהעמוד',
      'tools-page':'פעולות עמוד','tools-selection':'פעולות על בחירה',
      'composer-placeholder':'שאלו כל דבר על העמוד הזה…',
      'foot-note':'Aside עלול לטעות. בדקו מידע חשוב.',
      'onboarding-title':'התחילו את ה-AI שלכם',
      'onboarding-sub':'בחרו ספק והוסיפו מפתח API. המפתחות נשמרים אצלכם.',
      'onboarding-cta':'פתחו הגדרות',
      'error-title':'משהו השתבש','retry':'נסו שוב',
    }
  };
  const dir = (location.hash.match(/dir=(\w+)/) || [])[1] || new URLSearchParams(location.search).get('dir');
  const lang = (dir === 'rtl') ? 'he' : 'en';

  // Build the shim
  window.chrome = window.chrome || {};
  window.chrome.runtime = {
    id: '__aside-preview__',
    getURL: (p) => p,
    sendMessage: (msg, cb) => { console.log('[shim] runtime.sendMessage', msg); cb && cb({ ok: true }); },
    openOptionsPage: () => {
      // Navigate the parent (preview frame) to Settings if possible
      try { window.parent.postMessage({ type: '__open_settings' }, '*'); } catch {}
      // Fallback: navigate self
      const url = '../options/options.html';
      try { window.location.href = url; } catch {}
    },
    onMessage: { addListener: () => {} },
  };
  window.chrome.storage = {
    sync:  { get, set, clear, remove: () => Promise.resolve() },
    local: { get, set, clear, remove: () => Promise.resolve() },
  };
  window.chrome.i18n = {
    getMessage: (k) => (I18N[lang] && I18N[lang][k]) || (I18N.en[k] || ''),
    getUILanguage: () => lang === 'he' ? 'he' : 'en-US',
  };
  window.chrome.commands = { onCommand: { addListener: () => {} } };
  window.chrome.tabs = { query: () => Promise.resolve([]), sendMessage: () => Promise.resolve() };

  // Seed reasonable defaults for the preview so we don't show onboarding by default
  get(['activeProvider','apiKeys']).then(({ activeProvider, apiKeys }) => {
    if (!activeProvider) {
      set({ activeProvider: 'gemini', apiKeys: { ...(apiKeys||{}), gemini: 'demo-key' }, language: lang === 'he' ? 'he' : 'auto' });
    }
  });

  // Override ProviderFactory once it loads so preview returns canned responses
  // instead of hitting real APIs (which would fail without a key).
  function installFakeProvider() {
    if (!window.ProviderFactory) return setTimeout(installFakeProvider, 50);
    const real = window.ProviderFactory.get;
    window.ProviderFactory.get = function (id) {
      return {
        async complete(prompt) {
          // Tiny canned demo responses based on prompt verb
          const p = (prompt || '').toLowerCase();
          await new Promise(r => setTimeout(r, 700));
          if (lang === 'he') {
            if (p.includes('summar')) return 'דוגמה: סיכום קצר של העמוד.\n\n- נקודה ראשונה\n- נקודה שנייה\n- נקודה שלישית';
            if (p.includes('translat')) return 'תרגום לדוגמה של הטקסט הנבחר.';
            if (p.includes('explain')) return 'הסבר ברור: זוהי תצוגה מקדימה של הצ׳אט. כשתתקינו את התוסף האמיתי עם מפתח API, התשובות יהיו אמיתיות.';
            return 'זו תצוגה מקדימה. הוסיפו מפתח API דרך ההגדרות כדי לקבל תשובות אמיתיות.';
          }
          if (p.includes('summar')) return 'Here\'s a quick summary of the page:\n\n- This is a **preview** of the redesigned sidebar.\n- The chat thread, tools tab, and command bar are wired up.\n- Markdown, tables, and code blocks all render.\n\n```js\nconsole.log("ready");\n```';
          if (p.includes('translat')) return 'This is the translated text. Real translations will come from your selected provider.';
          if (p.includes('explain')) return 'Sure — this is the **preview mode**. The real extension calls your chosen provider (Claude, GPT-4o, Gemini…) with your API key. For now, responses are canned so you can see the layout.';
          if (p.includes('extract')) return '| Field | Value |\n|---|---|\n| Title | Sample Page |\n| Author | Demo |\n| Tags | preview, design |';
          if (p.includes('reply')) return '1. Sounds good — let\'s do it.\n2. Could you share more context first?\n3. I\'ll need to think on this and get back to you.';
          return 'This is a preview response. Install Aside as a Chrome extension and add your API key to get real answers.';
        }
      };
    };
  }
  installFakeProvider();
})();
