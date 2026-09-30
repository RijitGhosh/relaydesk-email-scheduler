import sanitizeHtml from 'sanitize-html';

const px = /^-?\d+(\.\d+)?(px|em|rem|%)?$/;
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ul', 'ol', 'li', 'blockquote', 'a', 'span', 'div', 'font', 'h1', 'h2', 'h3', 'pre', 'code', 'hr'],
  allowedAttributes: { a: ['href', 'target', 'rel'], font: ['size'], '*': ['style'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      margin: [/^[\d\s.px%-]+$/],
      'margin-left': [px],
      padding: [/^[\d\s.px%-]+$/],
      border: [/^none$/],
    },
  },
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) },
};

const looksLikeHtml = (s: string): boolean => /<\/?[a-z][\s\S]*?>/i.test(s);
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Accepts plain text or editor HTML and always returns safe HTML (scripts, handlers, iframes removed). */
export function sanitizeBody(input: string): string {
  const html = looksLikeHtml(input) ? input : `<p>${esc(input).replace(/\r?\n/g, '<br>')}</p>`;
  return sanitizeHtml(html, OPTIONS).trim();
}

const decode = (s: string): string =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote)\s*\/?>/gi, '\n');
  const stripped = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return decode(stripped).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const previewOf = (html: string, max = 140): string => htmlToText(html).replace(/\s+/g, ' ').slice(0, max);
