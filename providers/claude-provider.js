class ClaudeProvider extends BaseProvider {
  async complete(prompt, pageContext = '') {
    const { system, user } = this.buildMessages(prompt, pageContext);
    const data = await this._fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });
    return data.content?.[0]?.text || '';
  }
}
self.ClaudeProvider = ClaudeProvider;
