/**
 * Provider base class.
 * All providers expose a single `complete(prompt, pageContext?)` returning text.
 */
class BaseProvider {
  constructor(apiKey) { this.apiKey = apiKey; }
  async complete(prompt, pageContext = '') { throw new Error('not implemented'); }
  buildMessages(prompt, pageContext) {
    const sys = pageContext
      ? `You are a helpful assistant embedded in a browser sidebar. The user is on a webpage. Use the following page content as context when relevant:\n\n${pageContext}`
      : `You are a helpful assistant embedded in a browser sidebar.`;
    return { system: sys, user: prompt };
  }
  async _fetchJson(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); msg = j.error?.message || j.message || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }
}
self.BaseProvider = BaseProvider;
