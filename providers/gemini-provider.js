class GeminiProvider extends BaseProvider {
  // Gemini uses "model" for the assistant role, and takes a different message format.
  async complete(messages, systemPrompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const data = await this._fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 2048 }
      })
    });
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  }
  // completeStream falls back to base class (single-chunk emit via complete)
}
self.GeminiProvider = GeminiProvider;
