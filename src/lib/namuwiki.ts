export function getDocumentTitleFromLocation(loc: Location = location): string | null {
  const m = loc.pathname.match(/^\/w\/(.+)$/);
  if (!m) return null;
  const raw = m[1].split('#')[0].split('?')[0];
  return decodeSafe(raw);
}

// Returns candidate keywords to try against arca.live posts, in priority
// order. When the user clicks a hot-search item like "빅나티" that redirects
// to "BIG Naughty", namuwiki keeps the original term in `?from=`. That term
// is typically what the arca.live post was written about, so it goes first.
export function getDocumentKeywordsFromLocation(loc: Location = location): string[] {
  const primary = getDocumentTitleFromLocation(loc);
  if (!primary) return [];
  const params = new URLSearchParams(loc.search);
  const fromAlias = params.get('from')?.trim();
  const keywords: string[] = [];
  if (fromAlias && fromAlias !== primary) keywords.push(fromAlias);
  keywords.push(primary);
  return keywords;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
