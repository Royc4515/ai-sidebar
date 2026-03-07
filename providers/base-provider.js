/**
 * BaseProvider — abstract interface all AI providers must implement.
 * Three-layer architecture: providers only know about API calls, not UI.
 */
class BaseProvider {
  /**
   * Send a prompt (with optional page context) to the AI and return the response text.
   * @param {string} prompt - The user's prompt or action template output
   * @param {string} [context] - Optional page context to prepend
   * @returns {Promise<string>} The AI response text
   */
  async complete(prompt, context) {
    throw new Error(`${this.getName()}: complete() not implemented`);
  }

  /**
   * Validate an API key by making a minimal test call.
   * @param {string} apiKey
   * @returns {Promise<boolean>} true if valid
   */
  async validate(apiKey) {
    throw new Error(`${this.getName()}: validate() not implemented`);
  }

  /**
   * Human-readable provider name for display in the UI.
   * @returns {string}
   */
  getName() {
    throw new Error('getName() not implemented');
  }

  /**
   * Shared error handler — maps HTTP status codes to user-friendly messages.
   * @param {Response} response
   * @param {string} bodyText
   */
  _handleError(response, bodyText) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid API key — open Settings to update it.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit reached — wait a moment and try again.');
    }
    if (response.status === 500 || response.status === 503) {
      throw new Error(`${this.getName()} is temporarily unavailable. Try again shortly.`);
    }
    let detail = '';
    try {
      const parsed = JSON.parse(bodyText);
      detail = parsed?.error?.message || parsed?.message || '';
    } catch (_) {}
    throw new Error(`${this.getName()} error ${response.status}${detail ? ': ' + detail : ''}`);
  }
}
