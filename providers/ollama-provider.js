class OllamaProvider extends BaseProvider {
  constructor(_apiKey, baseUrl = 'http://localhost:11434') {
    super('');
    this.baseUrl = baseUrl;
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
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line).message?.content || '';
            if (chunk) { full += chunk; onChunk(chunk); }
          } catch {}
        }
      }
    } finally {
      try { reader.cancel(); } catch {}
    }
    return full;
  }
}
self.OllamaProvider = OllamaProvider;
