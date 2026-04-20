import type { ArcaPost, ReasonEntry } from './types';

export const ARCA_LIST_URL = 'https://arca.live/b/namuhotnow';

export async function fetchArcaList(): Promise<ArcaPost[]> {
  const res = await fetch(ARCA_LIST_URL, {
    credentials: 'omit',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`arca.live fetch failed: ${res.status}`);
  const html = await res.text();
  return parseArcaListHtml(html);
}

export async function fetchArcaPostBody(url: string): Promise<string | null> {
  const res = await fetch(url, {
    credentials: 'omit',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`arca.live post fetch failed: ${res.status}`);
  const html = await res.text();
  return extractArcaBody(html);
}

// MV3 service worker has no DOMParser, so we parse arca.live HTML with regex.
export function parseArcaListHtml(html: string): ArcaPost[] {
  const posts: ArcaPost[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\s+([^>]*\bclass="[^"]*\bvrow\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    if (/\bnotice\b/.test(attrs)) continue;
    const hrefMatch = /\bhref="([^"]+)"/.exec(attrs);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (seen.has(href)) continue;
    seen.add(href);

    const title = extractTitleText(inner);
    if (!title) continue;

    const timeMatch = /<time[^>]*\bdatetime="([^"]+)"/i.exec(inner);

    posts.push({
      title,
      url: href.startsWith('http') ? href : `https://arca.live${href}`,
      postedAt: timeMatch?.[1],
    });
  }
  return posts;
}

const NOISE_CLASSES = new Set([
  'comment-count',
  'badge',
  'vcol-badge',
  'icon',
  'tag',
]);

function extractTitleText(inner: string): string | null {
  const openRe = /<span\b[^>]*\bclass="([^"]*)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(inner)) !== null) {
    const classes = m[1].split(/\s+/);
    if (!classes.includes('title')) continue;
    const contentStart = m.index + m[0].length;
    const content = balancedSpanContent(inner, contentStart);
    if (content === null) continue;
    const pruned = pruneNoiseSpans(content);
    const text = decodeHtmlEntities(pruned.replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text;
  }
  return null;
}

function pruneNoiseSpans(html: string): string {
  return html.replace(
    /<span\b[^>]*\bclass="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi,
    (whole, classAttr: string, innerHtml: string) => {
      const classes = (classAttr as string).split(/\s+/);
      for (const c of classes) {
        if (NOISE_CLASSES.has(c)) return '';
      }
      return whole.replace(innerHtml, pruneNoiseSpans(innerHtml));
    },
  );
}

function balancedSpanContent(s: string, start: number): string | null {
  let depth = 1;
  let i = start;
  const openRe = /<span\b/gi;
  const closeTag = '</span>';
  while (i < s.length) {
    openRe.lastIndex = i;
    const nextOpen = openRe.exec(s);
    const nextClose = s.indexOf(closeTag, i);
    if (nextClose === -1) return null;
    if (nextOpen && nextOpen.index < nextClose) {
      depth++;
      const gt = s.indexOf('>', nextOpen.index);
      if (gt === -1) return null;
      i = gt + 1;
    } else {
      depth--;
      if (depth === 0) return s.slice(start, nextClose);
      i = nextClose + closeTag.length;
    }
  }
  return null;
}

const BODY_CLASS_CANDIDATES = ['fr-view', 'article-body', 'article-content'];
const MAX_BODY_LENGTH = 800;

export function extractArcaBody(html: string): string | null {
  for (const cls of BODY_CLASS_CANDIDATES) {
    const re = new RegExp(
      `<div\\b[^>]*\\bclass="([^"]*)"[^>]*>`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const classes = m[1].split(/\s+/);
      if (!classes.includes(cls)) continue;
      const start = m.index + m[0].length;
      const content = balancedDivContent(html, start);
      if (content === null) continue;
      const text = htmlBodyToText(content);
      if (text) return truncate(text, MAX_BODY_LENGTH);
    }
  }
  return null;
}

function htmlBodyToText(html: string): string {
  const cleaned = html
    // Strip embedded media and non-text elements whose fallback or alt text
    // would otherwise leak through (e.g. "귀하의 브라우저는 html5 video를 ...").
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<video\b[\s\S]*?<\/video>/gi, '')
    .replace(/<audio\b[\s\S]*?<\/audio>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/<figure\b[^>]*\bclass="[^"]*\b(?:video|audio|embed)\b[^"]*"[^>]*>[\s\S]*?<\/figure>/gi, '');
  const withBreaks = cleaned
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(stripped)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max).trimEnd()}…`;
}

function balancedDivContent(s: string, start: number): string | null {
  let depth = 1;
  let i = start;
  const openRe = /<div\b/gi;
  const closeRe = /<\/div\s*>/gi;
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

function decodeHtmlEntities(s: string): string {
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

const LEADING_TAG_RE = /^\s*(?:\[[^\]]+\]|\([^)]+\))\s*/g;
const DELIMITERS = [' - ', ' – ', ' — ', ' : ', ' :: ', ' | ', ' / '];

export function extractKeywordAndReason(
  title: string,
): { keyword: string; reason: string } | null {
  let cleaned = title;
  // strip leading [tag] / (tag) segments (can repeat)
  let prev: string;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(LEADING_TAG_RE, '').trim();
  } while (cleaned !== prev);

  for (const d of DELIMITERS) {
    const idx = cleaned.indexOf(d);
    if (idx > 0 && idx < cleaned.length - d.length) {
      const keyword = cleaned.slice(0, idx).trim();
      const reason = cleaned.slice(idx + d.length).trim();
      if (keyword && reason) return { keyword, reason };
    }
  }
  return null;
}

export function postsToReasons(posts: ArcaPost[]): ReasonEntry[] {
  const now = Date.now();
  const out: ReasonEntry[] = [];
  const seen = new Set<string>();
  for (const p of posts) {
    const parsed = extractKeywordAndReason(p.title);
    const keyword = parsed?.keyword ?? p.title;
    const reason = parsed?.reason ?? p.title;
    const dedupKey = `${p.url}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push({
      keyword,
      reason,
      sourceUrl: p.url,
      postTitle: p.title,
      fetchedAt: now,
    });
  }
  return out;
}
