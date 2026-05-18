class OpenAIProvider extends OpenAICompatProvider {
  constructor(apiKey) {
    super(apiKey);
    this.url = 'https://api.openai.com/v1/chat/completions';
    this.model = 'gpt-4o-mini';
  }
}
self.OpenAIProvider = OpenAIProvider;
