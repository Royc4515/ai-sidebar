/**
 * utils.js — pure utility functions used by sidebar.js
 * Loaded as a <script> tag before sidebar.js; also imported by the test suite.
 */

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000)   return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

/**
 * Sanitize an HTML string using the browser's own parser + DOM tree walk.
 * Strips disallowed elements/attributes. Safe against XSS in AI-generated content.
 */
function sanitizeHTML(html) {
  const ALLOWED_TAGS = new Set([
    'p', 'br', 'strong', 'em', 'b', 'i', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'hr', 'span', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'
  ]);

  const ALLOWED_ATTRS = {
    a:  ['href', 'title', 'target', 'rel'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  };

  const SAFE_URL_RE = /^(https?:|mailto:|#)/i;
  // These elements are dropped entirely (content included), not just unwrapped.
  const DROP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed']);

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tag = node.tagName.toLowerCase();

    if (DROP_TAGS.has(tag)) return null;  // discard element AND its content

    if (!ALLOWED_TAGS.has(tag)) {
      const frag = document.createDocumentFragment();
      for (const child of node.childNodes) {
        const cleaned = cleanNode(child);
        if (cleaned) frag.appendChild(cleaned);
      }
      return frag;
    }

    const el           = document.createElement(tag);
    const allowedAttrs = ALLOWED_ATTRS[tag] || [];

    for (const attr of allowedAttrs) {
      const val = node.getAttribute(attr);
      if (!val) continue;
      if (attr === 'href' && !SAFE_URL_RE.test(val.trim())) continue;
      el.setAttribute(attr, val);
    }

    if (tag === 'a') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }

    for (const child of node.childNodes) {
      const cleaned = cleanNode(child);
      if (cleaned) el.appendChild(cleaned);
    }

    return el;
  }

  const result  = document.createDocumentFragment();
  for (const child of doc.body.childNodes) {
    const cleaned = cleanNode(child);
    if (cleaned) result.appendChild(cleaned);
  }

  const wrapper = document.createElement('div');
  wrapper.appendChild(result);
  return wrapper.innerHTML;
}

/** Escape text for safe insertion into HTML attribute values or text nodes. */
function sanitizeText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(raw) {
  let text = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
    const safeUrl = url.replace(/&amp;/g, '&');
    if (!/^(https?:|mailto:)/i.test(safeUrl)) return `[${linkText}](${url})`;
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
  });

  text = text.replace(/```[\s\S]*?```/g, m => {
    const code = m.slice(3, -3).replace(/^[a-z]*\n/, '');
    return `<pre><code>${code}</code></pre>`;
  });

  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^### (.+)$/gm,  '<h4>$1</h4>');
  text = text.replace(/^## (.+)$/gm,   '<h3>$1</h3>');
  text = text.replace(/^# (.+)$/gm,    '<h2>$1</h2>');

  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g,         '<em>$1</em>');

  text = renderTables(text);

  text = text.replace(/^([ \t]*[-*•] .+(\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l =>
      `<li>${l.replace(/^[ \t]*[-*•] /, '')}</li>`
    ).join('');
    return `<ul>${items}</ul>`;
  });

  text = text.replace(/^([ \t]*\d+\. .+(\n|$))+/gm, m => {
    const items = m.trim().split('\n').map(l =>
      `<li>${l.replace(/^[ \t]*\d+\. /, '')}</li>`
    ).join('');
    return `<ol>${items}</ol>`;
  });

  text = text.replace(/\n\n+/g, '</p><p>');
  text = '<p>' + text + '</p>';
  text = text.replace(/<p><\/p>/g, '');

  text = text.split('\n').map(line =>
    /^<[a-z/]/.test(line.trim()) ? line : line + '<br>'
  ).join('\n');

  text = text.replace(/<p>(<(?:h[1-6]|ul|ol|table|pre)[^>]*>)/g, '$1');
  text = text.replace(/(<\/(?:h[1-6]|ul|ol|table|pre)>)<\/p>/g, '$1');

  return text;
}

function renderTables(text) {
  return text.replace(
    /((\|.+\|\n)+)/g,
    match => {
      const rows = match.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2) return match;
      const isAlignRow = (r) => /^\|[-| :]+\|$/.test(r.trim());
      let html   = '<table>';
      let inHead = true;
      for (const row of rows) {
        if (isAlignRow(row)) { html += '</thead><tbody>'; inHead = false; continue; }
        const cells = row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
        const tag   = inHead ? 'th' : 'td';
        html += '<tr>' + cells.map(c => `<${tag}>${sanitizeText(c.trim())}</${tag}>`).join('') + '</tr>';
      }
      html += (inHead ? '' : '</tbody>') + '</table>';
      return html;
    }
  );
}
