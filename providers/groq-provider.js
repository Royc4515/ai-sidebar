class GroqProvider extends OpenAICompatProvider {
  constructor(apiKey) {
    super(apiKey);
    this.url = 'https://api.groq.com/openai/v1/chat/completions';
    this.model = 'llama-3.3-70b-versatile';
    this.fallbackModel = 'llama-3.1-70b-versatile';
  }

  async complete(messages, systemPrompt) {
    if (!this.apiKey) throw new Error('Groq API key is missing. Please add it in settings.');
    try {
      return await super.complete(messages, systemPrompt);
    } catch (err) {
      if (err.message.includes('model_not_found') || err.message.includes('not found')) {
        const orig = this.model;
        this.model = this.fallbackModel;
        try { return await super.complete(messages, systemPrompt); }
        finally { this.model = orig; }
      }
      throw err;
    }
  }

  async completeStream(messages, systemPrompt, onChunk) {
    if (!this.apiKey) throw new Error('Groq API key is missing. Please add it in settings.');
    return super.completeStream(messages, systemPrompt, onChunk);
  }
}
self.GroqProvider = GroqProvider;
