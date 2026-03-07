/**
 * GrokProvider — xAI Grok API (OpenAI-compatible).
 * Docs: https://docs.x.ai/api
 */
class GrokProvider extends OpenAIProvider {
  constructor(apiKey) {
    super(apiKey, 'https://api.x.ai/v1', 'grok-3-mini');
  }

  getName() { return 'Grok'; }
}
