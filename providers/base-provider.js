/**
 * BaseProvider — abstract interface all AI providers must implement.
 * Three-layer architecture: providers only know about API calls, not UI.
 */
class BaseProvider {
  /**
   * Send a prompt (with optional page context) to the AI and return the response text.
   * @param {string} prompt
   * @param {string} [context]
   * @param {Array<{role:string, content:string}>} [history=[]]
   * @returns {Promise<string>}
   */
  async complete(prompt, context, history = []) {
    throw new Error(`${this.getName()}: complete() not implemented`);
  }

  /**
   * Stream a response token-by-token via a callback.
   * Falls back to complete() if not overridden.
   * @param {string} prompt
   * @param {string|null} context
   * @param {function(string): void} onChunk
   * @param {Array<{role:string, content:string}>} [history=[]]
   * @returns {Promise<string>}
   */
  async completeStream(prompt, context, onChunk, history = []) {
    const text = await this.complete(prompt, context, history);
    onChunk(text);
    return text;
  }

  /**
   * Validate an API key by making a minimal test call.
   * @param {string} apiKey
   * @returns {Promise<boolean>}
   */
  async validate(apiKey) {
    throw new Error(`${this.getName()}: validate() not implemented`);
  }

  /**
   * Human-readable provider name for display in the UI.
   * @returns {string}
   */
  getName() {
    throw new Error('getName() not implemented');
  }

  /**
   * Shared error handler — maps HTTP status codes to user-friendly messages.
   * @param {Response} response
   * @param {string} bodyText
   */
  _handleError(response, bodyText) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid API key — open Settings to update it.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit reached — wait a moment and try again.');
    }
    if (response.status === 402) {
      throw new Error(`${this.getName()} billing limit reached — check your account.`);
    }
    if (response.status === 400) {
      let detail = '';
      try { detail = JSON.parse(bodyText)?.error?.message || ''; } catch (_) {}
      throw new Error(`Bad request to ${this.getName()}${detail ? ': ' + detail : ' — check your prompt.'}`);
    }
    if (response.status === 404) {
      throw new Error(`${this.getName()} endpoint not found — the model may have changed.`);
    }
    if (response.status === 500 || response.status === 503) {
      throw new Error(`${this.getName()} is temporarily unavailable. Try again shortly.`);
    }
    let detail = '';
    try {
      const parsed = JSON.parse(bodyText);
      detail = parsed?.error?.message || parsed?.message || '';
    } catch (_) {}
    throw new Error(`${this.getName()} error ${response.status}${detail ? ': ' + detail : ''}`);
  }

  /**
   * Parse a Server-Sent Events stream, calling onChunk with each text delta.
   * @param {Response} response
   * @param {function(object): string|null} extractDelta
   * @param {function(string): void} onChunk
   * @returns {Promise<string>}
   */
  async _parseSSEStream(response, extractDelta, onChunk) {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer   = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep the incomplete final line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const json  = JSON.parse(trimmed.slice(6));
          const delta = extractDelta(json);
          if (delta) { fullText += delta; onChunk(delta); }
        } catch (_) {}
      }
    }
    return fullText;
  }

  /**
   * Parse an NDJSON stream (Ollama-style: one JSON object per newline).
   * @param {Response} response
   * @param {function(object): string|null} extractDelta
   * @param {function(string): void} onChunk
   * @returns {Promise<string>}
   */
  async _parseNDJSONStream(response, extractDelta, onChunk) {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer   = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.done) continue;
          const delta = extractDelta(json);
          if (delta) { fullText += delta; onChunk(delta); }
        } catch (_) {}
      }
    }
    return fullText;
  }
}
