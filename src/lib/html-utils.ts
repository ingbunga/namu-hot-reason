export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Returns the inner content of an element whose opening tag ends at `start`,
// correctly counting nested tags of the same name. Returns null if no
// balanced closing tag is found.
export function balancedElementContent(
  s: string,
  start: number,
  tagName: string,
): string | null {
  const openRe = new RegExp(`<${tagName}\\b`, 'gi');
  const closeRe = new RegExp(`</${tagName}\\s*>`, 'gi');
  let depth = 1;
  let i = start;
  while (i < s.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const nextOpen = openRe.exec(s);
    const nextClose = closeRe.exec(s);
    if (!nextClose) return null;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      const gt = s.indexOf('>', nextOpen.index);
      if (gt === -1) return null;
      i = gt + 1;
    } else {
      depth--;
      if (depth === 0) return s.slice(start, nextClose.index);
      i = nextClose.index + nextClose[0].length;
    }
  }
  return null;
}
