/**
 * OpenAIProvider — OpenAI Chat Completions API.
 * Docs: https://platform.openai.com/docs/api-reference/chat
 */
class OpenAIProvider extends BaseProvider {
  constructor(apiKey, baseUrl, model) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
    this.model = model || 'gpt-4o-mini';
  }

  getName() { return 'OpenAI'; }

  async complete(prompt, context) {
    const content = context
      ? `Page content:\n${context}\n\n---\n\n${prompt}`
      : prompt;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content }]
      })
    });

    const body = await response.text();
    if (!response.ok) this._handleError(response, body);
    const data = JSON.parse(body);
    return data.choices[0].message.content;
  }

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
    });
    return response.ok;
  }
}
