/**
 * QA test suite — runs Playwright against the loaded Aside extension.
 * Usage: xvfb-run -a node qa-test.js
 */

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const path = require('path');
const fs   = require('fs');

const EXTENSION_PATH = '/home/user/ai-sidebar';
const CHROME_BIN     = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const USER_DATA      = '/tmp/qa-profile-' + Date.now();
const SCREENSHOTS    = '/home/user/ai-sidebar/qa-screenshots';
const PORT           = 7891;

const results = [];
let screenshotIdx = 0;

const pass = (name) => { results.push({ name, ok: true });        process.stdout.write(`  ✅  ${name}\n`); };
const fail = (name, reason) => { results.push({ name, ok: false, reason }); process.stdout.write(`  ❌  ${name} — ${reason}\n`); };

// ── Mock SSE (Claude streaming format) ────────────────────────────────────
const MOCK_TEXT = 'This is a **streaming** response from the mock AI assistant.';
function claudeSseBody() {
  return MOCK_TEXT.split(' ')
    .map(w => `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${w} "}}`)
    .join('\n\n')
    + '\n\ndata: {"type":"message_stop"}\n\ndata: [DONE]\n\n';
}

// ── Local test server ──────────────────────────────────────────────────────
const startServer = () => new Promise(resolve => {
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><body>
      <h1>QA Test Page</h1>
      <p id="para">This is a test paragraph for the Aside extension QA.</p>
    </body></html>`);
  });
  srv.listen(PORT, '127.0.0.1', () => resolve(srv));
});

const screenshot = async (page, name) => {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, `${String(++screenshotIdx).padStart(2,'0')}-${name}.png`) });
};

// ── Wait with timeout helper ───────────────────────────────────────────────
const wait = ms => new Promise(r => setTimeout(r, ms));

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const server = await startServer();

  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(USER_DATA, {
      executablePath: CHROME_BIN,
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox',
        '--window-size=1280,800',
      ],
      viewport: { width: 1280, height: 800 },
    });

    // ── Suite 0: Extension boots ───────────────────────────────────────────
    console.log('\nSuite 0 — Extension');

    let sw = ctx.serviceWorkers()[0];
    if (!sw) {
      try { sw = await ctx.waitForEvent('serviceworker', { timeout: 8000 }); }
      catch { sw = ctx.serviceWorkers()[0]; }
    }
    if (sw) pass(`Service worker: ${new URL(sw.url()).hostname}`);
    else     { fail('Service worker active', 'not found'); }

    await wait(1500); // let SW fully initialise

    await sw.evaluate(() =>
      new Promise(r => chrome.storage.sync.set({
        activeProvider: 'claude',
        apiKeys: { claude: 'sk-ant-mock-qa-key' },
        language: 'auto'
      }, r))
    );
    pass('Mock storage set');

    // ── Navigate & get tab ─────────────────────────────────────────────────
    const page = await ctx.newPage();
    page.on('pageerror', e => process.stdout.write(`  [page err] ${e.message}\n`));

    // Intercept Anthropic API globally
    await ctx.route('**/api.anthropic.com/**', route =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
        body: claudeSseBody()
      })
    );

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await wait(2000); // content script runs

    // Get the tab ID via SW so we can send runtime messages to it
    const tabId = await sw.evaluate(async (port) => {
      const tabs = await new Promise(r => chrome.tabs.query({}, r));
      return tabs.find(t => t.url?.includes(`127.0.0.1:${port}`))?.id ?? null;
    }, PORT);

    if (tabId) pass(`Tab ID: ${tabId}`);
    else       fail('Tab ID found', 'could not locate tab');

    // ── Suite 1: Sidebar opens ─────────────────────────────────────────────
    console.log('\nSuite 1 — Sidebar open/close');

    // Trigger toggle via chrome.tabs.sendMessage (the real path)
    await sw.evaluate(id =>
      new Promise(r => chrome.tabs.sendMessage(id, { type: 'TOGGLE_SIDEBAR' }, r))
    , tabId);
    await wait(1500);

    const hostInjected = await page.evaluate(() =>
      !!document.getElementById('aside-sidebar-host')
    );
    if (hostInjected) pass('Sidebar host (#aside-sidebar-host) created');
    else              fail('Sidebar host created', 'element missing after toggle');

    const isVisible = await page.evaluate(() =>
      document.getElementById('aside-sidebar-host')?.classList.contains('is-visible')
    ).catch(() => false);
    if (isVisible) pass('Sidebar is-visible after toggle');
    else           fail('Sidebar is-visible', 'class missing');

    await screenshot(page, 'sidebar-open');

    // ── Suite 2: Sidebar UI elements ───────────────────────────────────────
    console.log('\nSuite 2 — Sidebar UI elements');

    const frame = page.frameLocator('#aside-sidebar-frame');

    try {
      await frame.locator('#hero').waitFor({ state: 'visible', timeout: 6000 });
      pass('Sidebar HTML loaded (hero visible)');
    } catch {
      fail('Sidebar HTML loaded', 'hero not visible within 6s');
    }

    const checks = [
      ['Hero shown on fresh open',   '#hero'],
      ['New chat button in header',  '#new-chat-btn'],
      ['Model picker button',        '#model-btn'],
      ['Settings button',            '#settings-btn'],
      ['Ask input',                  '#ask-input'],
      ['Send button',                '#ask-btn'],
    ];
    for (const [label, sel] of checks) {
      const ok = await frame.locator(sel).isVisible().catch(() => false);
      ok ? pass(label) : fail(label, `${sel} not visible`);
    }

    await screenshot(page, 'hero-fresh');

    // ── Suite 3: Trigger button color ──────────────────────────────────────
    console.log('\nSuite 3 — Selection trigger button');

    // Close sidebar first — trigger only appears when sidebar is closed
    await sw.evaluate(id =>
      new Promise(r => chrome.tabs.sendMessage(id, { type: 'TOGGLE_SIDEBAR' }, r))
    , tabId);
    await wait(600);

    // Simulate a text selection to create the trigger
    await page.evaluate(() => {
      const p = document.getElementById('para');
      const range = document.createRange();
      range.selectNodeContents(p);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
    await page.dispatchEvent('body', 'mouseup');
    await wait(300);

    const triggerActive = await page.evaluate(() =>
      document.getElementById('aside-selection-trigger')?.classList.contains('is-active')
    ).catch(() => false);

    if (triggerActive) {
      pass('Selection trigger button appears on text selection');
      const bg = await page.$eval('#aside-selection-trigger', el =>
        getComputedStyle(el).backgroundColor
      );
      if (bg === 'rgb(200, 100, 60)') pass(`Trigger button brand color ✓ (${bg})`);
      else fail('Trigger button brand color', `expected rgb(200,100,60), got ${bg}`);
    } else {
      fail('Selection trigger button appears', 'is-active class missing or element not found');
    }

    await screenshot(page, 'selection-trigger');

    // Re-open sidebar for remaining suites
    await sw.evaluate(id =>
      new Promise(r => chrome.tabs.sendMessage(id, { type: 'TOGGLE_SIDEBAR' }, r))
    , tabId);
    await wait(800);

    // ── Suite 4: Chat & streaming cursor (F4) ─────────────────────────────
    console.log('\nSuite 4 — Chat & streaming cursor (F4)');

    // Clear selection first
    await page.evaluate(() => window.getSelection().removeAllRanges());

    // Install a slow-stream fetch mock directly in the service worker.
    // It returns a ReadableStream that drips chunks every 120 ms so the
    // streaming cursor is visible before the stream ends.
    // Because no real network request is ever made, ctx.route is never
    // triggered — the two interception layers don't conflict.
    await sw.evaluate(() => {
      const WORDS = 'Slow stream verifies cursor visibility during streaming response end.'.split(' ');
      const saved  = self.fetch.bind(self);
      self.__savedFetch = saved;
      self.fetch = (url, opts) => {
        if (typeof url === 'string' && url.includes('api.anthropic.com')) {
          const enc = new TextEncoder();
          const stream = new ReadableStream({
            async start(ctrl) {
              for (const w of WORDS) {
                await new Promise(r => setTimeout(r, 120));
                ctrl.enqueue(enc.encode(
                  `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${w} "}}\n\n`
                ));
              }
              ctrl.enqueue(enc.encode('data: {"type":"message_stop"}\n\ndata: [DONE]\n\n'));
              ctrl.close();
            }
          });
          return Promise.resolve(new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
          }));
        }
        return saved(url, opts);
      };
    });

    const askInput = frame.locator('#ask-input');
    await askInput.fill('What is this page about?');
    await frame.locator('#ask-btn').click();
    await wait(400); // first chunk ~120ms in; at 400ms ~3/9 chunks delivered

    const userBubble = await frame.locator('.sb-turn--user').isVisible().catch(() => false);
    if (userBubble) pass('User message bubble rendered immediately');
    else            fail('User message bubble', 'not visible after send');

    // Cursor MUST be visible: 9 words × 120ms ≈ 1.08s total; 400ms in, ~6 chunks remain
    const cursorMid = await frame.locator('.sb-cursor').isVisible().catch(() => false);
    if (cursorMid) pass('Streaming cursor visible mid-stream');
    else           fail('Streaming cursor visible mid-stream',
                        '.sb-cursor not found at ~400ms into a ~1.1s stream');

    await screenshot(page, 'streaming-state');

    // Wait for stream to finish (remaining ~680ms) + slack
    await wait(2000);

    const turnCount = await frame.locator('.sb-turn').count().catch(() => 0);
    if (turnCount >= 2) pass(`Both turns rendered (${turnCount} turns)`);
    else                fail('Both turns rendered', `only ${turnCount} turn(s)`);

    const footerOk = await frame.locator('.sb-turn-foot').isVisible().catch(() => false);
    if (footerOk) pass('Turn footer (model + copy) visible after stream');
    else          fail('Turn footer visible', 'not found');

    const cursorGone = !(await frame.locator('.sb-cursor').isVisible().catch(() => false));
    if (cursorGone) pass('Streaming cursor gone after completion');
    else            fail('Streaming cursor gone', 'cursor still present after stream ended');

    await screenshot(page, 'response-complete');

    // Restore original fetch so subsequent suites use ctx.route normally
    await sw.evaluate(() => {
      if (self.__savedFetch) { self.fetch = self.__savedFetch; delete self.__savedFetch; }
    });

    // ── Suite 5: New chat ──────────────────────────────────────────────────
    console.log('\nSuite 5 — New chat');

    await frame.locator('#new-chat-btn').click();
    await wait(400);

    const turnsCleared = (await frame.locator('.sb-turn').count().catch(() => 99)) === 0;
    const heroBack     = await frame.locator('#hero').isVisible().catch(() => false);

    if (turnsCleared) pass('New chat clears all conversation turns');
    else              fail('New chat clears turns', `turns still in DOM`);

    if (heroBack) pass('Hero shown again after new chat');
    else          fail('Hero shown after new chat', 'hero not visible');

    await screenshot(page, 'new-chat');

    // ── Suite 6: Action label preserved on retry ───────────────────────────
    console.log('\nSuite 6 — Retry preserves action label');

    // Make next call fail with 401
    await ctx.unroute('**/api.anthropic.com/**');
    await ctx.route('**/api.anthropic.com/**', route =>
      route.fulfill({
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Invalid auth' } })
      })
    );

    const summarizeBtn = frame.locator('.sb-suggest-btn[data-action="summarize"]');
    if (await summarizeBtn.isVisible().catch(() => false)) {
      await summarizeBtn.click();
      await wait(2000);

      const errShown = await frame.locator('#error-state').isVisible().catch(() => false);
      if (errShown) pass('Error state shown on 401 response');
      else          fail('Error state shown', 'not visible');

      // Restore good route, retry
      await ctx.unroute('**/api.anthropic.com/**');
      await ctx.route('**/api.anthropic.com/**', route =>
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
          body: claudeSseBody()
        })
      );

      await frame.locator('#retry-btn').click();
      await wait(2500);

      const actionLabel = await frame.locator('.sb-turn-action span').first().textContent().catch(() => '');
      if (actionLabel === 'Summary') pass(`Retry keeps label "Summary" (not "Answer")`);
      else                           fail('Retry keeps label', `got "${actionLabel}", expected "Summary"`);

      await screenshot(page, 'retry-label');
    } else {
      fail('Summarize suggest button found', 'button not visible in hero');
    }

    // ── Suite 7: Selection action display label ────────────────────────────
    console.log('\nSuite 7 — Selection action display label');

    // Start fresh chat first
    await frame.locator('#new-chat-btn').click();
    await wait(300);

    // Restore route in case
    await ctx.unroute('**/api.anthropic.com/**');
    await ctx.route('**/api.anthropic.com/**', route =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
        body: claudeSseBody()
      })
    );

    // Send CONTEXT_MENU_ACTION via background → content script → sidebar
    await sw.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, {
        type: 'CONTEXT_MENU_ACTION',
        action: 'explain',
        text: 'Hello world this is selected text'
      });
    }, tabId);
    await wait(3000);

    const userText = await frame.locator('.sb-turn--user .sb-turn-content--user')
      .last().textContent().catch(() => '');
    // With our refactor: display = 'Explain: "Hello world..."' not the full prompt
    if (userText.startsWith('Explain:')) pass(`User bubble shows display label: "${userText.slice(0,50)}"…`);
    else                                 fail('User bubble display label', `got: "${userText.slice(0,80)}"`);

    await screenshot(page, 'explain-label');

    // ── Suite 8: Page action display label (F2) + find routing (F3) ──────
    console.log('\nSuite 8 — Page action display label (F2) + find routing (F3)');

    await frame.locator('#new-chat-btn').click();
    await wait(300);

    // Make sure we have a good route
    await ctx.unroute('**/api.anthropic.com/**');
    await ctx.route('**/api.anthropic.com/**', route =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
        body: claudeSseBody()
      })
    );

    // F2: click the "Summarize this page" hero suggest button;
    // the user bubble should show the display label, not the raw API prompt.
    const summarizeHero = frame.locator('.sb-suggest-btn[data-action="summarize"]');
    if (await summarizeHero.isVisible().catch(() => false)) {
      await summarizeHero.click();
      await wait(2500);
      const bubbleText = await frame.locator('.sb-turn--user .sb-turn-content--user')
        .first().textContent().catch(() => '');
      const isDisplayLabel  = bubbleText === 'Summarize this page';
      const isRawPrompt     = bubbleText.startsWith('Summarize this page in concise');
      if (isDisplayLabel)   pass('F2 — summarize bubble shows display label, not raw prompt');
      else if (isRawPrompt) fail('F2 — summarize bubble display label', 'shows raw API prompt instead');
      else                  fail('F2 — summarize bubble display label', `unexpected text: "${bubbleText.slice(0,80)}"`);
    } else {
      fail('F2 — summarize hero button found', 'button not visible');
    }

    await screenshot(page, 'page-action-label');

    // F3: switch to Tools tab, click the "Find on page" card.
    // Before F3 fix this was a silent no-op; now it must focus ask-input.
    await frame.locator('#new-chat-btn').click();
    await wait(200);
    await frame.locator('.sb-tab[data-tab="tools"]').click();
    await wait(300);

    const findCard = frame.locator('.sb-action-card[data-action="find"]');
    if (await findCard.isVisible().catch(() => false)) {
      await findCard.click();
      await wait(400); // click switches to chat tab, then handleAction('find') runs

      // The placeholder changes to the find prompt and input is focused
      const placeholder = await frame.locator('#ask-input').getAttribute('placeholder').catch(() => '');
      if (placeholder.includes('find on this page'))
        pass('F3 — find card changes input placeholder (not a silent no-op)');
      else
        fail('F3 — find card changes input placeholder', `got: "${placeholder}"`);
    } else {
      fail('F3 — find card visible in tools tab', 'card not found');
    }

    await screenshot(page, 'find-card');

    // ── Final screenshot ───────────────────────────────────────────────────
    await screenshot(page, 'final');

  } finally {
    if (ctx) await ctx.close();
    server.close();
    try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch {}
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`QA  ${passed.length}/${results.length} passed   ${failed.length > 0 ? `(${failed.length} failed)` : '✅ all green'}`);
  if (failed.length) {
    console.log('\nFailed:');
    failed.forEach(f => console.log(`  ❌  ${f.name}: ${f.reason}`));
  }
  console.log(`Screenshots → ${SCREENSHOTS}/`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => { console.error('\nRunner crashed:', err); process.exit(1); });
