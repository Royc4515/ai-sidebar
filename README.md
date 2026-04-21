# AI Sidebar

A Chrome extension that adds a context-aware AI assistant sidebar to any webpage. Supports streaming responses, multi-turn chat, six AI providers, and works with both free and paid APIs.

## Features

- **Streaming responses** — text appears word-by-word as the AI generates it
- **Multi-turn chat** — follow-up questions retain full conversation context
- **Six AI providers** — Claude, Gemini, GPT-4o, Grok, Groq (free), Ollama (local)
- **Per-provider model selection** — choose between fast, balanced, and powerful models
- **Context menu** — right-click selected text to trigger Explain / Summarize / Reply
- **Floating button** — appears on text selection for quick sidebar access
- **Custom action templates** — override the prompt for any action (Explain, Summarize, Reply, Extract)
- **Light / dark / auto theme** — follows system preference or set manually
- **Keyboard shortcut** — `Alt+A` toggles the sidebar on any page
- **Response history** — revisit previous one-shot responses within a session
- **Data extract** — pulls structured data from any page as a Markdown table

## Installation

### Chrome / Edge / Brave

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle, top-right).
4. Click **Load unpacked** and select the `ai-sidebar` folder.
5. The extension icon appears in the toolbar. Pin it for easy access.

No build step is required — the extension runs directly from source.

### Firefox

Firefox supports Manifest V3 with some limitations. Load via `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.json`. Note: temporary add-ons are removed on browser restart.

## Configuration

1. Click the extension icon in the toolbar, then click **Open Settings**, or right-click → **Options**.
2. **Choose a provider** — click the provider card to activate it.
3. **Enter your API key** — paste it in the key field and click **Validate** to verify.
4. **Select a model** — choose from the dropdown below each key field.
5. Click **Save Settings**.

### Getting API keys

| Provider | Free tier | Get key |
|----------|-----------|---------|
| Claude (Anthropic) | No | https://console.anthropic.com |
| Gemini (Google) | Yes | https://aistudio.google.com/app/apikey |
| GPT-4o (OpenAI) | No | https://platform.openai.com/api-keys |
| Grok (xAI) | No | https://console.x.ai |
| Groq | Yes | https://console.groq.com/keys |
| Ollama | Local | https://ollama.com (run `ollama serve`) |

For Ollama, enter your server URL (default: `http://localhost:11434`) instead of an API key, then click **Test**.

## Usage

### Opening the sidebar

- Press **Alt+A** (Windows/Linux) or **Option+A** (Mac) on any page.
- Click the extension icon → **Open Sidebar**.
- Select text on any page — a floating **✨ AI** button appears; click it.
- Right-click selected text and choose an action from the context menu.

### Action buttons

| Button | What it does | Requires |
|--------|-------------|---------|
| Explain | Explains the selected text | Text selection |
| Summarize | Summarizes the current page | Page content |
| Reply | Suggests 3 reply options | Text selection |
| Extract | Extracts page data as a table | Page content |

### Ask (multi-turn chat)

Type a question in the text box at the bottom and press **Enter** or click **Ask**. The AI will answer using the current page as context. Follow-up questions retain the conversation history for the current tab session.

Click **+ New** to start a fresh conversation.

### Custom action templates

Settings → **Action Templates** lets you override the prompt for any action. Use:
- `{{text}}` — the currently selected text
- `{{page}}` — the full page content

Leave blank to use the built-in default. Click **Reset to default** to clear a customization.

## Providers

| Provider | Default model | Free tier | Notes |
|----------|--------------|-----------|-------|
| Claude | Sonnet 4.6 | No | Best reasoning; Haiku is cheapest |
| Gemini | Flash 2.0 | Yes | Fast; generous free quota |
| GPT-4o mini | gpt-4o-mini | No | Cheap OpenAI option |
| Grok | Grok 3 mini | No | xAI; fast inference |
| Groq | Llama 3.3 70B | Yes | Very fast open-source models |
| Ollama | (your model) | Local | Runs entirely on your machine |

## Architecture

```
manifest.json
├── background/service-worker.js   — keyboard shortcuts, context menu, key validation
├── content/content.js             — injected into every page; manages the sidebar iframe
├── sidebar/
│   ├── sidebar.html / .css / .js  — the AI assistant UI (runs inside the iframe)
├── providers/
│   ├── base-provider.js           — abstract base: SSE streaming, NDJSON, error handling
│   ├── provider-factory.js        — creates the right provider from stored settings
│   └── *-provider.js              — one file per provider (Claude, Gemini, OpenAI, …)
├── settings/
│   └── settings.html / .css / .js — options page
└── popup/
    └── popup.html / .js           — toolbar popup (toggle + open settings)
```

The sidebar lives in an `<iframe>` injected by `content.js`. Communication flows via `postMessage` (page ↔ sidebar) and `chrome.runtime.sendMessage` (service worker ↔ content script). This isolation means the sidebar's scripts never touch the host page's DOM.

## Development

Edit any file and reload the extension to see changes:

1. Make your edits.
2. Go to `chrome://extensions`.
3. Click the **reload** icon on the AI Sidebar card.
4. Reload the tab you're testing on.

No build step, no bundler, no npm — plain HTML, CSS, and JS.
