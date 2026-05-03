class GroqProvider extends BaseProvider {
  async complete(prompt, pageContext = '') {
    if (!this.apiKey) {
      throw new Error('Groq API key is missing. Please add it in settings.');
    }
    const { system, user } = this.buildMessages(prompt, pageContext);
    
    const fetchWithModel = async (modelName) => {
      return await this._fetchJson('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        })
      });
    };

    try {
      // Primary model: Llama 3.3 70B
      const data = await fetchWithModel('llama-3.3-70b-versatile');
      if (!data.choices || data.choices.length === 0) {
        throw new Error('Groq API returned an empty response.');
      }
      return data.choices[0].message.content || '';
    } catch (err) {
      // Fallback to Llama 3.1 70B if Llama 3.3 fails (e.g. not available in all regions yet)
      if (err.message.includes('model_not_found') || err.message.includes('not found')) {
        try {
          const data = await fetchWithModel('llama-3.1-70b-versatile');
          return data.choices[0].message.content || '';
        } catch (innerErr) {
          throw innerErr;
        }
      }
      throw err;
    }
  }
}
self.GroqProvider = GroqProvider;
