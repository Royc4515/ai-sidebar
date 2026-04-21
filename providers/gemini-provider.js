/**
 * GeminiProvider — Google Gemini API.
 * Docs: https://ai.google.dev/api/generate-content
 *
 * NOTE: Gemini requires the API key as a URL query parameter (?key=...).
 * The Authorization header is NOT supported for this endpoint.
 * Risk: the key is visible in browser DevTools Network tab.
 * Mitigation: keys are stored in chrome.storage.sync (not in source code)
 * and are only transmitted to googleapis.com over HTTPS.
 * Treat your Gemini API key as sensitive and rotate it if exposed.
 */
class GeminiProvider extends BaseProvider {
  constructor(apiKey) {
    super();
    this.apiKey  = apiKey;
    this.model   = 'gemini-2.0-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  getName() { return 'Gemini'; }

  /** Map our internal history format (role:'assistant') to Gemini's format (role:'model'). */
  _toGeminiContents(history, currentText) {
    const contents = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    contents.push({ role: 'user', parts: [{ text: currentText }] });
    return contents;
  }

  /**
   * @param {string} prompt
   * @param {string} [context]
   * @param {Array<{role:string, content:string}>} [history=[]]
   * @returns {Promise<string>}
   */
  async complete(prompt, context, history = []) {
    const text     = context ? `Page content:\n${context}\n\n---\n\n${prompt}` : prompt;
    const contents = this._toGeminiContents(history, text);
    const url      = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1024 } })
    }).catch(() => {
      throw new Error('Network error reaching Gemini — check your connection.');
    });

    const body = await response.text();
    if (!response.ok) this._handleError(response, body);
    return JSON.parse(body).candidates[0].content.parts[0].text;
  }

  /**
   * @param {string} prompt
   * @param {string|null} context
   * @param {function(string): void} onChunk
   * @param {Array<{role:string, content:string}>} [history=[]]
   * @returns {Promise<string>}
   */
  async completeStream(prompt, context, onChunk, history = []) {
    const text     = context ? `Page content:\n${context}\n\n---\n\n${prompt}` : prompt;
    const contents = this._toGeminiContents(history, text);
    const url      = `${this.baseUrl}/${this.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1024 } })
    }).catch(() => {
      throw new Error('Network error reaching Gemini — check your connection.');
    });

    if (!response.ok) {
      const body = await response.text();
      this._handleError(response, body);
    }

    return this._parseSSEStream(
      response,
      (json) => json.candidates?.[0]?.content?.parts?.[0]?.text || null,
      onChunk
    );
  }

  /**
   * @param {string} apiKey
   * @returns {Promise<boolean>}
   */
  async validate(apiKey) {
    const url      = `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 }
      })
    }).catch(() => null);
    return !!response?.ok;
  }
}
