/**
 * ClaudeProvider — Anthropic Claude API.
 * Docs: https://docs.anthropic.com/en/api/messages
 */
class ClaudeProvider extends BaseProvider {
  constructor(apiKey, model) {
    super();
    this.apiKey  = apiKey;
    this.model   = model || 'claude-sonnet-4-6';
    this.baseUrl = 'https://api.anthropic.com/v1/messages';
  }

  getName() { return 'Claude'; }

  /**
   * @param {string} prompt
   * @param {string} [context]
   * @param {Array<{role:string, content:string}>} [history=[]]
   * @returns {Promise<string>}
   */
  async complete(prompt, context, history = []) {
    const content  = context ? `Page content:\n${context}\n\n---\n\n${prompt}` : prompt;
    const messages = [...history, { role: 'user', content }];

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: this.model, max_tokens: 1024, messages })
    }).catch(() => {
      throw new Error('Network error reaching Claude — check your connection.');
    });

    const body = await response.text();
    if (!response.ok) this._handleError(response, body);
    return JSON.parse(body).content[0].text;
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

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: this.model, max_tokens: 1024, stream: true, messages })
    }).catch(() => {
      throw new Error('Network error reaching Claude — check your connection.');
    });

    if (!response.ok) {
      const body = await response.text();
      this._handleError(response, body);
    }

    return this._parseSSEStream(
      response,
      (json) => (json.type === 'content_block_delta' && json.delta?.type === 'text_delta')
        ? json.delta.text
        : null,
      onChunk
    );
  }

  /**
   * @param {string} apiKey
   * @returns {Promise<boolean>}
   */
  async validate(apiKey) {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    }).catch(() => null);
    return !!response?.ok;
  }
}
