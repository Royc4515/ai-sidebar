/**
 * ClaudeProvider — Anthropic Claude API.
 * Docs: https://docs.anthropic.com/en/api/messages
 */
class ClaudeProvider extends BaseProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.model = 'claude-sonnet-4-6';
    this.baseUrl = 'https://api.anthropic.com/v1/messages';
  }

  getName() { return 'Claude'; }

  async complete(prompt, context) {
    const content = context
      ? `Page content:\n${context}\n\n---\n\n${prompt}`
      : prompt;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
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
    return data.content[0].text;
  }

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
    });
    return response.ok;
  }
}
