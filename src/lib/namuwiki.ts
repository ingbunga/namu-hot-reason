export function getDocumentTitleFromLocation(loc: Location = location): string | null {
  const m = loc.pathname.match(/^\/w\/(.+)$/);
  if (!m) return null;
  const raw = m[1].split('#')[0].split('?')[0];
  return decodeSafe(raw);
}

// Returns candidate keywords in priority order. When the user clicks a hot
// search item like "빅나티" that redirects to "BIG Naughty", namuwiki keeps
// the original term in `?from=`. That original term is often what the
// arca.live post was written about, so it should be tried first.
export function getDocumentKeywordsFromLocation(loc: Location = location): string[] {
  const primary = getDocumentTitleFromLocation(loc);
  const keywords: string[] = [];
  const params = new URLSearchParams(loc.search);
  const fromAlias = params.get('from')?.trim();
  if (fromAlias) keywords.push(fromAlias);
  if (primary && primary !== fromAlias) keywords.push(primary);
  return keywords;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
