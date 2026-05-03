/**
 * ProviderFactory.get(id, apiKeys) → provider instance.
 */
class ProviderFactory {
  static get(id, apiKeys = {}) {
    const key = apiKeys[id] || '';
    switch (id) {
      case 'claude': return new ClaudeProvider(key);
      case 'gemini': return new GeminiProvider(key);
      case 'openai': return new OpenAIProvider(key);
      case 'grok':   return new GrokProvider(key);
      case 'groq':   return new GroqProvider(key);
      case 'ollama': return new OllamaProvider();
      default: throw new Error(`Unknown provider: ${id}`);
    }
  }
}
self.ProviderFactory = ProviderFactory;
