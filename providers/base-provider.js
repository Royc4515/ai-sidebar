class BaseProvider {
  constructor(apiKey) { this.apiKey = apiKey; }

  // Returns the system prompt string embedding page context + language preference.
  buildSystemPrompt(pageContext, language) {
    let sys = 'You are a helpful AI assistant embedded in a browser sidebar.';
    if (pageContext) {
      sys += ` The user is viewing a webpage. Use the following page content as context when relevant:\n\n${pageContext}`;
    }
    if (language) sys += `\n\nAlways respond in ${language}.`;
    return sys;
  }

  // messages: [{role:'user'|'assistant', content:string}]
  async complete(messages, systemPrompt) {
    throw new Error('not implemented');
  }

  // Calls onChunk(deltaText) for each text delta received.
  // Returns Promise<string> with full accumulated text.
  // Default fallback: calls complete() once and emits one chunk.
  async completeStream(messages, systemPrompt, onChunk) {
    const text = await this.complete(messages, systemPrompt);
    onChunk(text);
    return text;
  }

  // Generic SSE parser for OpenAI-compatible streaming APIs.
  // extractChunk(parsedEvent) returns the delta string, or '' to skip the event.
  async _streamSSE(url, opts, onChunk, extractChunk) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); msg = j.error?.message || j.message || msg; } catch {}
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
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = extractChunk(JSON.parse(data));
          if (chunk) { full += chunk; onChunk(chunk); }
        } catch {}
      }
    }
    return full;
  }

  async _fetchJson(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); msg = j.error?.message || j.message || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }
}
self.BaseProvider = BaseProvider;
