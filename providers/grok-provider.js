class GrokProvider extends OpenAICompatProvider {
  constructor(apiKey) {
    super(apiKey);
    this.url = 'https://api.x.ai/v1/chat/completions';
    this.model = 'grok-2-1212';
  }
}
self.GrokProvider = GrokProvider;
