class GeminiProvider extends BaseProvider {
  async complete(prompt, pageContext = '') {
    const { system, user } = this.buildMessages(prompt, pageContext);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const data = await this._fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 2048 }
      })
    });
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  }
}
self.GeminiProvider = GeminiProvider;
