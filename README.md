<div align="center">

# AI Sidebar

**Chrome extension that injects a context-aware AI assistant sidebar into any webpage,  
routing prompts to one of six AI providers with streaming responses.**

<br>

<img src="https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome MV3">&nbsp;
<img src="https://img.shields.io/badge/providers-6-8b5cf6" alt="6 providers">&nbsp;
<img src="https://img.shields.io/badge/build-none-22c55e" alt="no build step">&nbsp;
<img src="https://img.shields.io/badge/version-1.0.0-64748b" alt="v1.0.0">

</div>

---

## Features

- **Six AI providers** — Claude, Gemini, OpenAI, Grok, Groq, and Ollama; selected at runtime via `ProviderFactory`
- **OOP provider hierarchy** — `BaseProvider` abstract class with concrete subclasses; `GrokProvider` and `GroqProvider` extend `OpenAIProvider` by passing a different `baseUrl` to `super()`
- **MV3 Service Worker** — handles `Alt+A` keyboard command, context menu registration, and live `VALIDATE_KEY` requests with a 10-second `Promise.race` timeout
- **Cross-origin `postMessage` security** — sidebar iframe validates `event.source === window.parent` before accepting any message; user-supplied text is always set via `textContent`, never `innerHTML`
- **Page content extraction** — `extractPageContent()` walks semantic selectors (`article`, `main`, `[role="main"]`, `.article-body`, `.post-content`…), strips nav/chrome nodes, and truncates at 12,000 chars
- **Live API key validation** — settings page sends `VALIDATE_KEY` to the service worker, which instantiates the provider and calls `validate()` against the real API
- **Custom Markdown-to-HTML renderer** — hand-rolled `renderMarkdown()` covers headings, bold/italic, code blocks, tables, and lists; output is sanitized by a DOM-based allowlist (`sanitizeHTML()`) before insertion

---

## Architecture

```mermaid
classDiagram
    class BaseProvider {
        +complete()
        +completeStream()
        +validate()
        +getName()
        #_handleError()
        #_parseSSEStream()
        #_parseNDJSONStream()
    }
    BaseProvider <|-- ClaudeProvider
    BaseProvider <|-- GeminiProvider
    BaseProvider <|-- OpenAIProvider
    BaseProvider <|-- OllamaProvider
    OpenAIProvider <|-- GrokProvider
    OpenAIProvider <|-- GroqProvider
```

`ProviderFactory.get(name, apiKeys, selectedModels)` applies the **Strategy pattern** — the sidebar calls `provider.completeStream()` with no knowledge of which class is running. `GrokProvider` and `GroqProvider` are one-liners that pass a different `baseUrl` to `super()`, reusing the entire `OpenAIProvider` implementation. Switching providers requires only a single `chrome.storage.sync` write.

---

## Providers

| Provider | Default model | Additional models |
|---|---|---|
| **Claude** (Anthropic) | `claude-sonnet-4-6` | `claude-haiku-4-5-20251001` · `claude-opus-4-7` |
| **Gemini** (Google) | `gemini-2.0-flash` | `gemini-1.5-flash` · `gemini-1.5-pro` · `gemini-2.5-pro` |
| **OpenAI** | `gpt-4o-mini` | `gpt-4o` · `o4-mini` |
| **Grok** (xAI) † | `grok-3-mini` | `grok-3` |
| **Groq** † | `llama-3.3-70b-versatile` | `llama-3.1-8b-instant` · `gemma2-9b-it` |
| **Ollama** (local) | `llama3.2` | any locally pulled model |

<sup>† Grok and Groq use OpenAI-compatible APIs — `GrokProvider` and `GroqProvider` extend `OpenAIProvider`.</sup>

---

## Install

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `ai-sidebar` folder

> [!NOTE]
> No build step required — plain HTML, CSS, and JS.
