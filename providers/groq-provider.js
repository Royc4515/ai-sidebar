class GroqProvider extends BaseProvider {
  _msgs(messages, systemPrompt) {
    return [{ role: 'system', content: systemPrompt }, ...messages];
  }

  async complete(messages, systemPrompt) {
    if (!this.apiKey) throw new Error('Groq API key is missing. Please add it in settings.');
    const body = { max_tokens: 2048, messages: this._msgs(messages, systemPrompt) };
    const tryModel = async (model) => {
      const data = await this._fetchJson('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({ ...body, model })
      });
      if (!data.choices?.length) throw new Error('Groq API returned an empty response.');
      return data.choices[0].message.content || '';
    };
    try {
      return await tryModel('llama-3.3-70b-versatile');
    } catch (err) {
      if (err.message.includes('model_not_found') || err.message.includes('not found')) {
        return await tryModel('llama-3.1-70b-versatile');
      }
      throw err;
    }
  }

  async completeStream(messages, systemPrompt, onChunk) {
    if (!this.apiKey) throw new Error('Groq API key is missing. Please add it in settings.');
    return this._streamSSE(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 2048, stream: true, messages: this._msgs(messages, systemPrompt) })
      },
      onChunk,
      ev => ev.choices?.[0]?.delta?.content || ''
    );
  }
}
self.GroqProvider = GroqProvider;
