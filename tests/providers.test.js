// All provider classes and ProviderFactory are loaded into globalThis by tests/setup.js.

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mock a fetch that returns a plain text / JSON body with an HTTP status. */
function mockFetch(body, status = 200) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

/** Mock a fetch that rejects (network-level failure). */
function mockFetchReject() {
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
}

/**
 * Mock a streaming fetch: the response body is a minimal async reader that
 * yields `text` as a single Uint8Array chunk, then signals done.
 */
function mockStreamFetch(text, status = 200) {
  const enc = new TextEncoder();
  const buf = enc.encode(text);
  let consumed = false;
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    body: {
      getReader: () => ({
        read: () =>
          consumed
            ? Promise.resolve({ done: true, value: undefined })
            : (() => { consumed = true; return Promise.resolve({ done: false, value: buf }); })(),
      }),
    },
    text: () => Promise.resolve(text),
  });
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

// ── BaseProvider._handleError ─────────────────────────────────────────────────

describe('BaseProvider._handleError', () => {
  // Use OpenAIProvider as a concrete subclass; error handling is in BaseProvider.
  const p = new OpenAIProvider('key');

  it('throws "Invalid API key" on 401', () => {
    expect(() => p._handleError({ status: 401 }, '')).toThrow('Invalid API key');
  });

  it('throws "Invalid API key" on 403', () => {
    expect(() => p._handleError({ status: 403 }, '')).toThrow('Invalid API key');
  });

  it('throws "Rate limit" on 429', () => {
    expect(() => p._handleError({ status: 429 }, '')).toThrow('Rate limit');
  });

  it('throws billing message on 402', () => {
    expect(() => p._handleError({ status: 402 }, '')).toThrow('billing limit');
  });

  it('throws "unavailable" on 500', () => {
    expect(() => p._handleError({ status: 500 }, '')).toThrow('unavailable');
  });

  it('throws "unavailable" on 503', () => {
    expect(() => p._handleError({ status: 503 }, '')).toThrow('unavailable');
  });

  it('includes JSON error detail in 400 responses', () => {
    const body = JSON.stringify({ error: { message: 'context length exceeded' } });
    expect(() => p._handleError({ status: 400 }, body)).toThrow('context length exceeded');
  });

  it('includes status code in generic error message', () => {
    expect(() => p._handleError({ status: 418 }, '')).toThrow('418');
  });
});

// ── BaseProvider._parseSSEStream ──────────────────────────────────────────────

describe('BaseProvider._parseSSEStream', () => {
  it('accumulates deltas and returns the full text', async () => {
    const p = new OpenAIProvider('key');
    const sseText = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: [DONE]',
    ].join('\n\n') + '\n\n';

    mockStreamFetch(sseText);
    const res = await globalThis.fetch('url');
    const chunks = [];
    const text = await p._parseSSEStream(
      res,
      (json) => json.choices?.[0]?.delta?.content || null,
      (c) => chunks.push(c),
    );
    expect(text).toBe('Hello world');
    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('silently skips malformed JSON data lines', async () => {
    const p = new OpenAIProvider('key');
    const sseText = 'data: not-json\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n\n';

    mockStreamFetch(sseText);
    const res = await globalThis.fetch('url');
    const text = await p._parseSSEStream(
      res,
      (json) => json.choices?.[0]?.delta?.content || null,
      () => {},
    );
    expect(text).toBe('ok');
  });
});

// ── BaseProvider._parseNDJSONStream ───────────────────────────────────────────

describe('BaseProvider._parseNDJSONStream', () => {
  it('accumulates deltas until done:true', async () => {
    const p = new OllamaProvider('http://localhost:11434');
    const ndjson = [
      '{"message":{"content":"Hi"},"done":false}',
      '{"message":{"content":" there"},"done":false}',
      '{"done":true}',
    ].join('\n') + '\n';

    mockStreamFetch(ndjson);
    const res = await globalThis.fetch('url');
    const chunks = [];
    const text = await p._parseNDJSONStream(
      res,
      (json) => json.message?.content || null,
      (c) => chunks.push(c),
    );
    expect(text).toBe('Hi there');
    expect(chunks).toEqual(['Hi', ' there']);
  });
});

// ── ClaudeProvider ────────────────────────────────────────────────────────────

describe('ClaudeProvider', () => {
  it('defaults to claude-sonnet-4-6', () => {
    expect(new ClaudeProvider('key').model).toBe('claude-sonnet-4-6');
  });

  it('accepts a custom model', () => {
    expect(new ClaudeProvider('key', 'claude-haiku-4-5-20251001').model).toBe('claude-haiku-4-5-20251001');
  });

  describe('complete()', () => {
    it('returns content[0].text on success', async () => {
      mockFetch({ content: [{ text: 'Claude answer' }] });
      expect(await new ClaudeProvider('key').complete('prompt')).toBe('Claude answer');
    });

    it('sends x-api-key header', async () => {
      mockFetch({ content: [{ text: 'ok' }] });
      await new ClaudeProvider('sk-ant-abc').complete('hi');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'sk-ant-abc' }) }),
      );
    });

    it('prepends page context when provided', async () => {
      mockFetch({ content: [{ text: 'ok' }] });
      await new ClaudeProvider('key').complete('explain', 'page text here');
      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain('page text here');
    });

    it('includes history before the current message', async () => {
      mockFetch({ content: [{ text: 'ok' }] });
      const history = [
        { role: 'user', content: 'prior question' },
        { role: 'assistant', content: 'prior answer' },
      ];
      await new ClaudeProvider('key').complete('follow up', null, history);
      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toBe('prior question');
      expect(body.messages[1].content).toBe('prior answer');
      expect(body.messages[2].content).toBe('follow up');
    });

    it('throws on network error', async () => {
      mockFetchReject();
      await expect(new ClaudeProvider('key').complete('hi')).rejects.toThrow('Network error');
    });

    it('throws "Invalid API key" on 401', async () => {
      mockFetch('unauthorized', 401);
      await expect(new ClaudeProvider('key').complete('hi')).rejects.toThrow('Invalid API key');
    });
  });

  describe('completeStream()', () => {
    it('streams Claude content_block_delta events', async () => {
      const sseText = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" Claude"}}',
        'data: {"type":"message_stop"}',
      ].join('\n\n') + '\n\n';

      mockStreamFetch(sseText);
      const chunks = [];
      const text = await new ClaudeProvider('key').completeStream('hi', null, (c) => chunks.push(c));
      expect(text).toBe('Hello Claude');
      expect(chunks).toEqual(['Hello', ' Claude']);
    });

    it('throws on HTTP error before streaming', async () => {
      mockStreamFetch('forbidden', 403);
      await expect(
        new ClaudeProvider('key').completeStream('hi', null, () => {}),
      ).rejects.toThrow('Invalid API key');
    });
  });

  describe('validate()', () => {
    it('returns true when response is ok', async () => {
      mockFetch({ content: [{ text: 'ok' }] }, 200);
      expect(await new ClaudeProvider('key').validate('key')).toBe(true);
    });

    it('returns false when response is not ok', async () => {
      mockFetch('bad', 401);
      expect(await new ClaudeProvider('key').validate('bad-key')).toBe(false);
    });

    it('returns false on network failure', async () => {
      mockFetchReject();
      expect(await new ClaudeProvider('key').validate('key')).toBe(false);
    });
  });
});

// ── OpenAIProvider ────────────────────────────────────────────────────────────

describe('OpenAIProvider', () => {
  it('defaults to gpt-4o-mini', () => {
    expect(new OpenAIProvider('key').model).toBe('gpt-4o-mini');
  });

  describe('complete()', () => {
    it('returns choices[0].message.content', async () => {
      mockFetch({ choices: [{ message: { content: 'GPT answer' } }] });
      expect(await new OpenAIProvider('key').complete('hi')).toBe('GPT answer');
    });

    it('sends Authorization Bearer header', async () => {
      mockFetch({ choices: [{ message: { content: 'ok' } }] });
      await new OpenAIProvider('sk-abc').complete('hi');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk-abc' }) }),
      );
    });

    it('throws on network error', async () => {
      mockFetchReject();
      await expect(new OpenAIProvider('key').complete('hi')).rejects.toThrow('Network error');
    });
  });

  describe('completeStream()', () => {
    it('parses OpenAI delta format and returns full text', async () => {
      const sseText = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" GPT"}}]}',
        'data: [DONE]',
      ].join('\n\n') + '\n\n';

      mockStreamFetch(sseText);
      const chunks = [];
      const text = await new OpenAIProvider('key').completeStream('hi', null, (c) => chunks.push(c));
      expect(text).toBe('Hello GPT');
      expect(chunks).toEqual(['Hello', ' GPT']);
    });
  });

  describe('validate()', () => {
    it('returns true on 200', async () => {
      mockFetch({ choices: [{ message: { content: 'ok' } }] });
      expect(await new OpenAIProvider('key').validate('key')).toBe(true);
    });

    it('returns false on 401', async () => {
      mockFetch('bad', 401);
      expect(await new OpenAIProvider('key').validate('bad')).toBe(false);
    });
  });
});

// ── GrokProvider / GroqProvider ───────────────────────────────────────────────

describe('GrokProvider', () => {
  it('targets xAI API base URL', () => {
    expect(new GrokProvider('xai-key').baseUrl).toBe('https://api.x.ai/v1');
  });

  it('defaults to grok-3-mini', () => {
    expect(new GrokProvider('key').model).toBe('grok-3-mini');
  });

  it('getName() returns "Grok"', () => {
    expect(new GrokProvider('key').getName()).toBe('Grok');
  });

  it('accepts a custom model', () => {
    expect(new GrokProvider('key', 'grok-3').model).toBe('grok-3');
  });
});

describe('GroqProvider', () => {
  it('targets Groq API base URL', () => {
    expect(new GroqProvider('key').baseUrl).toBe('https://api.groq.com/openai/v1');
  });

  it('defaults to llama-3.3-70b-versatile', () => {
    expect(new GroqProvider('key').model).toBe('llama-3.3-70b-versatile');
  });

  it('getName() returns "Groq"', () => {
    expect(new GroqProvider('key').getName()).toBe('Groq');
  });
});

// ── GeminiProvider ────────────────────────────────────────────────────────────

describe('GeminiProvider', () => {
  it('defaults to gemini-2.0-flash', () => {
    expect(new GeminiProvider('key').model).toBe('gemini-2.0-flash');
  });

  describe('_toGeminiContents()', () => {
    it('maps assistant role to model role', () => {
      const p = new GeminiProvider('key');
      const history = [
        { role: 'user',      content: 'hello' },
        { role: 'assistant', content: 'hi'    },
      ];
      const contents = p._toGeminiContents(history, 'new msg');
      expect(contents[1].role).toBe('model');
    });

    it('appends the current message as the last user turn', () => {
      const p = new GeminiProvider('key');
      const contents = p._toGeminiContents([], 'current');
      expect(contents).toHaveLength(1);
      expect(contents[0].role).toBe('user');
      expect(contents[0].parts[0].text).toBe('current');
    });
  });

  describe('complete()', () => {
    it('returns candidates[0].content.parts[0].text', async () => {
      mockFetch({ candidates: [{ content: { parts: [{ text: 'Gemini answer' }] } }] });
      expect(await new GeminiProvider('key').complete('hi')).toBe('Gemini answer');
    });

    it('puts API key in the URL query string', async () => {
      mockFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
      await new GeminiProvider('AIza-secret').complete('hi');
      expect(globalThis.fetch.mock.calls[0][0]).toContain('key=AIza-secret');
    });

    it('throws on network error', async () => {
      mockFetchReject();
      await expect(new GeminiProvider('key').complete('hi')).rejects.toThrow('Network error');
    });
  });

  describe('completeStream()', () => {
    it('parses Gemini SSE format', async () => {
      const sseText = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
        'data: {"candidates":[{"content":{"parts":[{"text":" Gemini"}]}}]}',
      ].join('\n\n') + '\n\n';

      mockStreamFetch(sseText);
      const chunks = [];
      const text = await new GeminiProvider('key').completeStream('hi', null, (c) => chunks.push(c));
      expect(text).toBe('Hello Gemini');
    });
  });

  describe('validate()', () => {
    it('returns true on 200', async () => {
      mockFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
      expect(await new GeminiProvider('key').validate('key')).toBe(true);
    });

    it('returns false on 400', async () => {
      mockFetch('bad', 400);
      expect(await new GeminiProvider('key').validate('bad')).toBe(false);
    });
  });
});

// ── OllamaProvider ────────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  it('strips trailing slash from baseUrl', () => {
    expect(new OllamaProvider('http://localhost:11434/').baseUrl).toBe('http://localhost:11434');
  });

  it('defaults to localhost', () => {
    expect(new OllamaProvider().baseUrl).toBe('http://localhost:11434');
  });

  describe('complete()', () => {
    it('returns message.content', async () => {
      mockFetch({ message: { content: 'Ollama reply' } });
      expect(await new OllamaProvider('http://localhost:11434').complete('hi')).toBe('Ollama reply');
    });

    it('falls back to response field', async () => {
      mockFetch({ response: 'fallback reply' });
      expect(await new OllamaProvider('http://localhost:11434').complete('hi')).toBe('fallback reply');
    });

    it('throws friendly error when server is unreachable', async () => {
      mockFetchReject();
      await expect(new OllamaProvider('http://localhost:11434').complete('hi'))
        .rejects.toThrow('Ollama not found');
    });
  });

  describe('completeStream()', () => {
    it('parses NDJSON stream and returns full text', async () => {
      const ndjson = [
        '{"message":{"content":"Hello"},"done":false}',
        '{"message":{"content":" Ollama"},"done":false}',
        '{"done":true}',
      ].join('\n') + '\n';

      mockStreamFetch(ndjson);
      const chunks = [];
      const text = await new OllamaProvider('http://localhost:11434').completeStream(
        'hi', null, (c) => chunks.push(c),
      );
      expect(text).toBe('Hello Ollama');
      expect(chunks).toEqual(['Hello', ' Ollama']);
    });
  });

  describe('validate()', () => {
    it('returns true when the configured model is in /api/tags', async () => {
      mockFetch({ models: [{ name: 'llama3.2' }, { name: 'mistral:latest' }] });
      expect(await new OllamaProvider('http://localhost:11434', 'llama3.2').validate()).toBe(true);
    });

    it('matches model:tag variants', async () => {
      mockFetch({ models: [{ name: 'llama3.2:latest' }] });
      expect(await new OllamaProvider('http://localhost:11434', 'llama3.2').validate()).toBe(true);
    });

    it('throws with "ollama pull" hint when model is missing', async () => {
      mockFetch({ models: [{ name: 'mistral:latest' }] });
      await expect(
        new OllamaProvider('http://localhost:11434', 'llama3.2').validate(),
      ).rejects.toThrow('ollama pull llama3.2');
    });

    it('returns false when server is unreachable', async () => {
      mockFetchReject();
      expect(await new OllamaProvider('http://localhost:11434', 'llama3.2').validate()).toBe(false);
    });

    it('returns false when /api/tags returns non-200', async () => {
      mockFetch('error', 500);
      expect(await new OllamaProvider('http://localhost:11434', 'llama3.2').validate()).toBe(false);
    });
  });
});

// ── ProviderFactory ───────────────────────────────────────────────────────────

describe('ProviderFactory.get()', () => {
  const keys = {
    claude: 'sk-ant-x', gemini: 'AIza-x', openai: 'sk-x',
    grok: 'xai-x', groq: 'gsk_x', ollama: 'http://localhost:11434',
  };

  it('creates ClaudeProvider for "claude"', () => {
    expect(ProviderFactory.get('claude', keys, {})).toBeInstanceOf(ClaudeProvider);
  });

  it('creates GeminiProvider for "gemini"', () => {
    expect(ProviderFactory.get('gemini', keys, {})).toBeInstanceOf(GeminiProvider);
  });

  it('creates OpenAIProvider for "openai"', () => {
    expect(ProviderFactory.get('openai', keys, {})).toBeInstanceOf(OpenAIProvider);
  });

  it('creates GrokProvider for "grok"', () => {
    expect(ProviderFactory.get('grok', keys, {})).toBeInstanceOf(GrokProvider);
  });

  it('creates GroqProvider for "groq"', () => {
    expect(ProviderFactory.get('groq', keys, {})).toBeInstanceOf(GroqProvider);
  });

  it('creates OllamaProvider for "ollama"', () => {
    expect(ProviderFactory.get('ollama', keys, {})).toBeInstanceOf(OllamaProvider);
  });

  it('throws on unknown provider name', () => {
    expect(() => ProviderFactory.get('unknown', {}, {})).toThrow('Unknown provider');
  });

  it('passes selectedModels through to the provider', () => {
    const p = ProviderFactory.get('claude', keys, { claude: 'claude-opus-4-7' });
    expect(p.model).toBe('claude-opus-4-7');
  });

  it('passes selected Groq model', () => {
    const p = ProviderFactory.get('groq', keys, { groq: 'llama-3.1-8b-instant' });
    expect(p.model).toBe('llama-3.1-8b-instant');
  });
});
