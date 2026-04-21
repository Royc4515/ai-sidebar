import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Load a source file and expose named globals into the test environment.
 * Uses new Function so the code runs in the global scope — classes referenced
 * by name (e.g. `extends BaseProvider`) resolve via globalThis assignments
 * from earlier calls.
 */
function loadIntoGlobal(relPath, names) {
  const code = fs.readFileSync(path.join(root, relPath), 'utf8');
  const result = (new Function(code + `\nreturn { ${names.join(', ')} };`))();
  for (const [k, v] of Object.entries(result)) globalThis[k] = v;
}

// ── Chrome extension API stubs ──────────────────────────────────────────────

globalThis.chrome = {
  storage: {
    sync: {
      get:  vi.fn(() => Promise.resolve({})),
      set:  vi.fn(() => Promise.resolve()),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: {
    openOptionsPage: vi.fn(),
    getURL: (p) => `chrome-extension://test/${p}`,
  },
};

// ── Provider classes ────────────────────────────────────────────────────────
// Loaded in dependency order so each class can reference its base class.

loadIntoGlobal('providers/base-provider.js',    ['BaseProvider']);
loadIntoGlobal('providers/openai-provider.js',  ['OpenAIProvider']);  // before grok/groq
loadIntoGlobal('providers/claude-provider.js',  ['ClaudeProvider']);
loadIntoGlobal('providers/gemini-provider.js',  ['GeminiProvider']);
loadIntoGlobal('providers/grok-provider.js',    ['GrokProvider']);
loadIntoGlobal('providers/groq-provider.js',    ['GroqProvider']);
loadIntoGlobal('providers/ollama-provider.js',  ['OllamaProvider']);
loadIntoGlobal('providers/provider-factory.js', ['ProviderFactory']);

// ── Sidebar utilities (need jsdom globals: DOMParser, document) ─────────────

loadIntoGlobal('sidebar/utils.js', [
  'sanitizeHTML', 'sanitizeText', 'renderMarkdown', 'renderTables', 'formatTimeAgo',
]);
