/**
 * OllamaProvider — local Ollama inference server.
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 * No API key needed; uses OpenAI-compatible endpoint at localhost.
 */
class OllamaProvider extends BaseProvider {
  constructor(baseUrl, model) {
    super();
    this.baseUrl = (baseUrl || 'http://localhost:11434').replace(/\/$/, '');
    this.model   = model || 'llama3.2';
  }

  getName() { return 'Ollama'; }

  /**
   * @param {string} prompt
   * @param {string} [context]
   * @param {Array<{role:string, content:string}>} [history=[]]
   * @returns {Promise<string>}
   */
  async complete(prompt, context, history = []) {
    const content  = context ? `Page content:\n${context}\n\n---\n\n${prompt}` : prompt;
    const messages = [...history, { role: 'user', content }];

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, stream: false, messages })
    }).catch(() => {
      throw new Error('Ollama not found — is it running? Try: ollama serve');
    });

    const body = await response.text();
    if (!response.ok) this._handleError(response, body);
    const data = JSON.parse(body);
    return data.message?.content || data.response || '';
  }

  /**
   * @param {string} prompt
   * @param {string|null} context
   * @param {function(string): void} onChunk
   * @param {Array<{role:string, content:string}>} [history=[]]
   * @returns {Promise<string>}
   */
  async completeStream(prompt, context, onChunk, history = []) {
    const content  = context ? `Page content:\n${context}\n\n---\n\n${prompt}` : prompt;
    const messages = [...history, { role: 'user', content }];

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, stream: true, messages })
    }).catch(() => {
      throw new Error('Ollama not found — is it running? Try: ollama serve');
    });

    if (!response.ok) {
      const body = await response.text();
      this._handleError(response, body);
    }

    return this._parseNDJSONStream(
      response,
      (json) => json.message?.content || null,
      onChunk
    );
  }

  /**
   * Checks that Ollama is running AND that the configured model is available.
   * @param {string} [baseUrl]
   * @returns {Promise<boolean>}
   */
  async validate(baseUrl) {
    const url = (baseUrl || this.baseUrl).replace(/\/$/, '');
    try {
      const response = await fetch(`${url}/api/tags`);
      if (!response.ok) return false;
      const data = JSON.parse(await response.text());
      const names = (data.models || []).map(m => m.name);
      // Match exact name or "model:tag" variants
      const modelBase = this.model.split(':')[0];
      const found = names.some(n => n === this.model || n.startsWith(modelBase + ':'));
      if (!found) {
        // Throw so the caller can surface the message
        throw new Error(`Ollama running but model '${this.model}' not found — run: ollama pull ${this.model}`);
      }
      return true;
    } catch (e) {
      if (e.message.includes('ollama pull')) throw e; // re-throw model-not-found
      return false;
    }
  }
}
