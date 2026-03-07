/**
 * OllamaProvider — local Ollama inference server.
 * Docs: https://ollama.com/blog/openai-compatibility
 * No API key needed; uses OpenAI-compatible endpoint at localhost.
 */
class OllamaProvider extends BaseProvider {
  constructor(baseUrl, model) {
    super();
    this.baseUrl = (baseUrl || 'http://localhost:11434').replace(/\/$/, '');
    this.model = model || 'llama3.2';
  }

  getName() { return 'Ollama'; }

  async complete(prompt, context) {
    const content = context
      ? `Page content:\n${context}\n\n---\n\n${prompt}`
      : prompt;

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [{ role: 'user', content }]
      })
    }).catch(() => {
      throw new Error('Ollama not found — is it running? Try: ollama serve');
    });

    const body = await response.text();
    if (!response.ok) this._handleError(response, body);
    const data = JSON.parse(body);
    return data.message?.content || data.response || '';
  }

  async validate(baseUrl) {
    const url = (baseUrl || this.baseUrl).replace(/\/$/, '');
    const response = await fetch(`${url}/api/tags`).catch(() => null);
    return !!response?.ok;
  }
}
