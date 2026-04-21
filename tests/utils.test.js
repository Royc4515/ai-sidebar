// sanitizeHTML, sanitizeText, renderMarkdown, renderTables, formatTimeAgo
// are loaded into globalThis by tests/setup.js

describe('sanitizeText', () => {
  it('escapes &', () => expect(sanitizeText('a & b')).toBe('a &amp; b'));
  it('escapes <', () => expect(sanitizeText('<tag>')).toBe('&lt;tag&gt;'));
  it('escapes >', () => expect(sanitizeText('3 > 2')).toBe('3 &gt; 2'));
  it('escapes "', () => expect(sanitizeText('"quoted"')).toBe('&quot;quoted&quot;'));
  it('coerces non-strings', () => expect(sanitizeText(42)).toBe('42'));
});

describe('sanitizeHTML', () => {
  it('strips <script> tags and their content', () => {
    const out = sanitizeHTML('<script>alert(1)</script><p>safe</p>');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert');
    expect(out).toContain('<p>safe</p>');
  });

  it('strips event handler attributes', () => {
    const out = sanitizeHTML('<p onclick="alert(1)">text</p>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('text');
  });

  it('strips javascript: href', () => {
    const out = sanitizeHTML('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
  });

  it('keeps https: href', () => {
    const out = sanitizeHTML('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it('adds target=_blank and rel=noopener to links', () => {
    const out = sanitizeHTML('<a href="https://example.com">link</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('strips <img> (not in allowlist) but keeps surrounding text', () => {
    const out = sanitizeHTML('before<img src="x" onerror="alert(1)">after');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('onerror');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('unwraps unknown elements while keeping their text', () => {
    const out = sanitizeHTML('<custom-el>keep this</custom-el>');
    expect(out).not.toContain('<custom-el>');
    expect(out).toContain('keep this');
  });

  it('keeps allowed inline tags: strong, em, code', () => {
    const out = sanitizeHTML('<p><strong>bold</strong> <em>italic</em> <code>code</code></p>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<code>code</code>');
  });

  it('keeps table structure', () => {
    const out = sanitizeHTML('<table><tr><th>H</th></tr><tr><td>D</td></tr></table>');
    expect(out).toContain('<table>');
    expect(out).toContain('<th>H</th>');
    expect(out).toContain('<td>D</td>');
  });

  it('strips data: URL in href', () => {
    const out = sanitizeHTML('<a href="data:text/html,<script>x</script>">x</a>');
    expect(out).not.toContain('data:');
  });

  it('passes empty string through', () => {
    expect(sanitizeHTML('')).toBe('');
  });
});

describe('renderMarkdown', () => {
  it('renders **bold** as <strong>', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('renders *italic* as <em>', () => {
    expect(renderMarkdown('*italic*')).toContain('<em>italic</em>');
  });

  it('renders `inline code` as <code>', () => {
    expect(renderMarkdown('`code here`')).toContain('<code>code here</code>');
  });

  it('renders fenced code block as <pre><code>', () => {
    const out = renderMarkdown('```\nconst x = 1;\n```');
    expect(out).toContain('<pre>');
    expect(out).toContain('<code>');
    expect(out).toContain('const x = 1;');
  });

  it('renders # heading as <h2>', () => {
    expect(renderMarkdown('# Title')).toContain('<h2>Title</h2>');
  });

  it('renders ## heading as <h3>', () => {
    expect(renderMarkdown('## Subtitle')).toContain('<h3>Subtitle</h3>');
  });

  it('renders unordered list items inside <ul>', () => {
    const out = renderMarkdown('- first\n- second');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>first</li>');
    expect(out).toContain('<li>second</li>');
  });

  it('renders ordered list items inside <ol>', () => {
    const out = renderMarkdown('1. alpha\n2. beta');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>alpha</li>');
  });

  it('renders [text](https://url) as <a>', () => {
    const out = renderMarkdown('[click me](https://example.com)');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('click me');
  });

  it('does NOT linkify javascript: URLs', () => {
    // URL is rejected so no href attribute is created;
    // the original bracket notation remains as plain text.
    const out = renderMarkdown('[bad](javascript:alert(1))');
    expect(out).not.toContain('href=');
    expect(out).not.toContain('<a ');
  });

  it('escapes raw HTML tags in text', () => {
    const out = renderMarkdown('<script>bad</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('renderTables', () => {
  it('renders a markdown table as an HTML table', () => {
    const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n';
    const out = renderTables(md);
    expect(out).toContain('<table>');
    expect(out).toContain('<th>');
    expect(out).toContain('<td>');
    expect(out).toContain('Alice');
    expect(out).toContain('30');
  });

  it('escapes HTML in table cells (XSS prevention)', () => {
    const md = '| Col |\n| --- |\n| <script>xss</script> |\n';
    const out = renderTables(md);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('puts the first row in <thead> and subsequent rows in <tbody>', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const out = renderTables(md);
    expect(out).toContain('</thead>');
    expect(out).toContain('<tbody>');
  });
});

describe('formatTimeAgo', () => {
  it('returns "just now" for under 1 minute', () => {
    expect(formatTimeAgo(Date.now() - 30_000)).toBe('just now');
  });

  it('returns minutes for under 1 hour', () => {
    expect(formatTimeAgo(Date.now() - 5 * 60_000)).toBe('5m ago');
  });

  it('returns hours for 1 hour or more', () => {
    expect(formatTimeAgo(Date.now() - 2 * 3_600_000)).toBe('2h ago');
  });
});
