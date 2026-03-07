/**
 * ProviderFactory — constructs the correct provider class from stored settings.
 * The sidebar calls ProviderFactory.get() and never touches provider internals.
 */
const ProviderFactory = {
  /**
   * @param {string} name - provider key from storage (e.g. 'claude')
   * @param {Object} apiKeys - map of provider → key from chrome.storage
   * @returns {BaseProvider}
   */
  get(name, apiKeys = {}) {
    switch (name) {
      case 'claude':  return new ClaudeProvider(apiKeys.claude);
      case 'gemini':  return new GeminiProvider(apiKeys.gemini);
      case 'openai':  return new OpenAIProvider(apiKeys.openai);
      case 'grok':    return new GrokProvider(apiKeys.grok);
      case 'groq':    return new GroqProvider(apiKeys.groq);
      case 'ollama':  return new OllamaProvider(apiKeys.ollama);
      default: throw new Error(`Unknown provider: "${name}". Check Settings.`);
    }
  },

  /** All supported providers with display metadata */
  ALL: [
    { id: 'claude',  label: 'Claude (Anthropic)',    placeholder: 'sk-ant-...',             free: false },
    { id: 'gemini',  label: 'Gemini (Google)',        placeholder: 'AIza...',                free: true  },
    { id: 'openai',  label: 'GPT-4o mini (OpenAI)',   placeholder: 'sk-...',                 free: false },
    { id: 'grok',    label: 'Grok (xAI)',              placeholder: 'xai-...',               free: false },
    { id: 'groq',    label: 'Groq (free & fast)',      placeholder: 'gsk_...',               free: true  },
    { id: 'ollama',  label: 'Ollama (local)',          placeholder: 'http://localhost:11434', free: true  }
  ]
};
