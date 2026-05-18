class BaseProvider {
  constructor(apiKey) { this.apiKey = apiKey; }

  buildSystemPrompt(pageContext, language) {
    let sys = 'You are a helpful AI assistant embedded in a browser sidebar.';
    if (pageContext) {
      sys += ` The user is viewing a webpage. Use the following page content as context when relevant:\n\n${pageContext}`;
    }
    if (language) sys += `\n\nAlways respond in ${language}.`;
    return sys;
  }

  // Prepends the system prompt to user/assistant turns for OpenAI-style APIs.
  _msgs(messages, systemPrompt) {
    return [{ role: 'system', content: systemPrompt }, ...messages];
  }

  async complete(messages, systemPrompt) {
    throw new Error('not implemented');
  }

  // Default fallback: single-chunk emit from complete().
  async completeStream(messages, systemPrompt, onChunk) {
    const text = await this.complete(messages, systemPrompt);
    onChunk(text);
    return text;
  }

  // Generic SSE parser. extractChunk(parsedEvent) returns delta string or ''.
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
    try {
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
    } finally {
      try { reader.cancel(); } catch {}
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

// Shared implementation for OpenAI / Grok / Groq. Subclasses set this.url and this.model.
class OpenAICompatProvider extends BaseProvider {
  _headers() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` };
  }
  _body(messages, systemPrompt, extra) {
    return JSON.stringify({
      model: this.model,
      max_tokens: 2048,
      messages: this._msgs(messages, systemPrompt),
      ...extra
    });
  }
  async complete(messages, systemPrompt) {
    const data = await this._fetchJson(this.url, {
      method: 'POST', headers: this._headers(), body: this._body(messages, systemPrompt)
    });
    return data.choices?.[0]?.message?.content || '';
  }
  async completeStream(messages, systemPrompt, onChunk) {
    return this._streamSSE(
      this.url,
      { method: 'POST', headers: this._headers(), body: this._body(messages, systemPrompt, { stream: true }) },
      onChunk,
      ev => ev.choices?.[0]?.delta?.content || ''
    );
  }
}
self.OpenAICompatProvider = OpenAICompatProvider;
