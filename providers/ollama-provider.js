class OllamaProvider extends BaseProvider {
  constructor(_apiKey, baseUrl = 'http://localhost:11434') {
    super('');
    this.baseUrl = baseUrl;
  }

  _msgs(messages, systemPrompt) {
    return [{ role: 'system', content: systemPrompt }, ...messages];
  }

  async complete(messages, systemPrompt) {
    const data = await this._fetchJson(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3.1', stream: false, messages: this._msgs(messages, systemPrompt) })
    });
    return data.message?.content || '';
  }

  // Ollama streams NDJSON (one JSON object per line), not SSE.
  async completeStream(messages, systemPrompt, onChunk) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3.1', stream: true, messages: this._msgs(messages, systemPrompt) })
    });
    if (!res.ok) {
      const msg = `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          const chunk = ev.message?.content || '';
          if (chunk) { full += chunk; onChunk(chunk); }
        } catch {}
      }
    }
    return full;
  }
}
self.OllamaProvider = OllamaProvider;
