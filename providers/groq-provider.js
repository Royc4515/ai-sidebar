/**
 * GroqProvider — Groq Cloud API (OpenAI-compatible, very fast inference).
 * Docs: https://console.groq.com/docs/api-reference
 */
class GroqProvider extends OpenAIProvider {
  constructor(apiKey, model) {
    super(apiKey, 'https://api.groq.com/openai/v1', model || 'llama-3.3-70b-versatile');
  }

  getName() { return 'Groq'; }
}
