class GrokProvider extends BaseProvider {
  _msgs(messages, systemPrompt) {
    return [{ role: 'system', content: systemPrompt }, ...messages];
  }

  async complete(messages, systemPrompt) {
    const data = await this._fetchJson('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: 'grok-2-1212', max_tokens: 2048, messages: this._msgs(messages, systemPrompt) })
    });
    return data.choices?.[0]?.message?.content || '';
  }

  async completeStream(messages, systemPrompt, onChunk) {
    return this._streamSSE(
      'https://api.x.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: 'grok-2-1212', max_tokens: 2048, stream: true, messages: this._msgs(messages, systemPrompt) })
      },
      onChunk,
      ev => ev.choices?.[0]?.delta?.content || ''
    );
  }
}
self.GrokProvider = GrokProvider;
