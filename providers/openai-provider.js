class OpenAIProvider extends BaseProvider {
  async complete(prompt, pageContext = '') {
    const { system, user } = this.buildMessages(prompt, pageContext);
    const data = await this._fetchJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 2048,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    return data.choices?.[0]?.message?.content || '';
  }
}
self.OpenAIProvider = OpenAIProvider;
