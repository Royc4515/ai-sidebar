/**
 * GrokProvider — xAI Grok API (OpenAI-compatible).
 * Docs: https://docs.x.ai/api
 */
class GrokProvider extends OpenAIProvider {
  constructor(apiKey, model) {
    super(apiKey, 'https://api.x.ai/v1', model || 'grok-3-mini');
  }

  getName() { return 'Grok'; }
}
