class OllamaProvider extends BaseProvider {
  constructor(_apiKey, baseUrl = 'http://localhost:11434') {
    super('');
    this.baseUrl = baseUrl;
  }
  async complete(prompt, pageContext = '') {
    const { system, user } = this.buildMessages(prompt, pageContext);
    const data = await this._fetchJson(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1',
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    return data.message?.content || '';
  }
}
self.OllamaProvider = OllamaProvider;
