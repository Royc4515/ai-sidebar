class OpenAIProvider extends BaseProvider {
  _msgs(messages, systemPrompt) {
    return [{ role: 'system', content: systemPrompt }, ...messages];
  }

  async complete(messages, systemPrompt) {
    const data = await this._fetchJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 2048, messages: this._msgs(messages, systemPrompt) })
    });
    return data.choices?.[0]?.message?.content || '';
  }

  async completeStream(messages, systemPrompt, onChunk) {
    return this._streamSSE(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 2048, stream: true, messages: this._msgs(messages, systemPrompt) })
      },
      onChunk,
      ev => ev.choices?.[0]?.delta?.content || ''
    );
  }
}
self.OpenAIProvider = OpenAIProvider;
