/**
 * OpenAIProvider — OpenAI Chat Completions API.
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */
class OpenAIProvider extends BaseProvider {
  constructor(apiKey, baseUrl, model) {
    super();
    this.apiKey  = apiKey;
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
    this.model   = model  || 'gpt-4o-mini';
  }

  getName() { return 'OpenAI'; }

  /**
   * @param {string} prompt
   * @param {string} [context]
   * @param {Array<{role:string, content:string}>} [history=[]]
   * @returns {Promise<string>}
   */
  async complete(prompt, context, history = []) {
    const content  = context ? `Page content:\n${context}\n\n---\n\n${prompt}` : prompt;
    const messages = [...history, { role: 'user', content }];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ model: this.model, max_tokens: 1024, messages })
    }).catch(() => {
      throw new Error(`Network error reaching ${this.getName()} — check your connection.`);
    });

    const body = await response.text();
    if (!response.ok) this._handleError(response, body);
    return JSON.parse(body).choices[0].message.content;
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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ model: this.model, max_tokens: 1024, stream: true, messages })
    }).catch(() => {
      throw new Error(`Network error reaching ${this.getName()} — check your connection.`);
    });

    if (!response.ok) {
      const body = await response.text();
      this._handleError(response, body);
    }

    return this._parseSSEStream(
      response,
      (json) => json.choices?.[0]?.delta?.content || null,
      onChunk
    );
  }

  /**
   * @param {string} apiKey
   * @returns {Promise<boolean>}
   */
  async validate(apiKey) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
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
