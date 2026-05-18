class ClaudeProvider extends BaseProvider {
  async complete(messages, systemPrompt) {
    const data = await this._fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 2048,
        system: systemPrompt,
        messages
      })
    });
    return data.content?.[0]?.text || '';
  }

  async completeStream(messages, systemPrompt, onChunk) {
    return this._streamSSE(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-latest',
          max_tokens: 2048,
          system: systemPrompt,
          messages,
          stream: true
        })
      },
      onChunk,
      ev => (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta')
        ? ev.delta.text
        : ''
    );
  }
}
self.ClaudeProvider = ClaudeProvider;
