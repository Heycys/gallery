import { linkAddress, loginTitle } from '../../../../shared/web-links.mjs';

/** Read inert clipboard markup, never insert/execute it. Edge's smart links carry the tab title. */
export function pastedLink(plain: string, html: string): { url: string; title: string } | null {
  if (plain.length + html.length > 128 * 1024) return null;
  const template = document.createElement('template');
  template.innerHTML = /^\s*<iframe\b/i.test(plain) ? plain : html;
  if (template.content.querySelectorAll('iframe[src], a[href]').length !== 1) return null;
  const frame = template.content.querySelector('iframe[src]');
  const anchor = template.content.querySelector('a[href]');
  const element = frame ?? anchor;
  if (!element) return null;
  const raw = element.getAttribute(frame ? 'src' : 'href') ?? '';
  if (!/^https?:\/\//i.test(raw)) return null;
  const address = linkAddress(raw);
  if (address.refused) return null;
  // A mismatched rich-text link must never replace a different plain-text URL.
  if (/^https?:\/\//i.test(plain.trim()) && linkAddress(plain).url !== address.url) return null;
  const title = (frame ? frame.getAttribute('title') : anchor?.textContent)?.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim() ?? '';
  return { url: address.url!, title: title && !loginTitle(title) && !/^https?:\/\//i.test(title) ? title.slice(0, 200) : '' };
}
