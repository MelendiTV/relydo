export type LegalTextPart = { text: string; href?: string };

// Web URLs are consumed only to keep embedded addresses as plain text.
// Only standalone email addresses become links; never interpret HTML.
export function splitLegalLinks(text: string): LegalTextPart[] {
  const pattern = /https?:\/\/[^\s<>"“”]+|www\.[^\s<>"“”]+|[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi;
  const parts: LegalTextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (/^(?:https?:\/\/|www\.)/i.test(match[0])) continue;
    if (start > 0 && /[\w@/:-]/.test(text[start - 1])) continue;
    const visible = match[0];
    const href = `mailto:${encodeURIComponent(visible).replace(/%40/g, "@")}`;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: visible, href });
    cursor = start + visible.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
