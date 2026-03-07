/**
 * GeminiProvider — Google Gemini API.
 * Docs: https://ai.google.dev/api/generate-content
 */
class GeminiProvider extends BaseProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.model = 'gemini-2.0-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  getName() { return 'Gemini'; }

  async complete(prompt, context) {
    const text = context
      ? `Page content:\n${context}\n\n---\n\n${prompt}`
      : prompt;

    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { maxOutputTokens: 1024 }
      })
    });

    const body = await response.text();
    if (!response.ok) this._handleError(response, body);
    const data = JSON.parse(body);
    return data.candidates[0].content.parts[0].text;
  }

  async validate(apiKey) {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 }
      })
    });
    return response.ok;
  }
}
