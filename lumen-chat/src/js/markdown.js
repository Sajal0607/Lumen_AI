// Safe Markdown rendering: marked -> highlight.js -> DOMPurify.
// Raw HTML in messages is escaped (shown as text) and the final HTML is
// sanitized before it ever touches the DOM.
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const marked = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    },
  }),
  {
    gfm: true,
    breaks: false,
    renderer: {
      // Never pass through raw HTML from user or model messages.
      html({ text }) {
        return escapeHtml(text);
      },
    },
  },
);

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
  FORBID_ATTR: ['style'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
};

export function renderMarkdown(text) {
  const html = marked.parse(text ?? '', { async: false });
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

/** Wraps each <pre><code> block with a header showing the language and a copy button. */
export function enhanceCodeBlocks(container, createCopyButton) {
  for (const pre of container.querySelectorAll('pre')) {
    if (pre.parentElement?.classList.contains('code-block')) continue;
    const code = pre.querySelector('code');
    if (!code) continue;

    const languageClass = [...code.classList].find((c) => c.startsWith('language-'));
    const language = languageClass ? languageClass.replace('language-', '') : 'text';

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block not-prose';
    const header = document.createElement('div');
    header.className = 'code-block-header';
    const label = document.createElement('span');
    label.textContent = language;
    header.append(label, createCopyButton(() => code.textContent ?? '', `Copy ${language} code`));

    pre.replaceWith(wrapper);
    wrapper.append(header, pre);
  }
}
