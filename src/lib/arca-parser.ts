import { balancedElementContent, decodeHtmlEntities } from './html-utils';
import type { ArcaPost, ReasonEntry } from './types';

export const ARCA_LIST_URL = 'https://arca.live/b/namuhotnow';

export async function fetchArcaList(): Promise<ArcaPost[]> {
  const res = await fetch(ARCA_LIST_URL, {
    credentials: 'omit',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`arca.live list fetch failed: ${res.status}`);
  return parseArcaListHtml(await res.text());
}

export async function fetchArcaPostBody(url: string): Promise<string | null> {
  const res = await fetch(url, {
    credentials: 'omit',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`arca.live post fetch failed: ${res.status}`);
  return extractArcaBody(await res.text());
}

// ---------------------------------------------------------------------------
// List parsing
// ---------------------------------------------------------------------------

// MV3 service worker has no DOMParser, so arca.live HTML is parsed via regex.
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
    const content = balancedElementContent(inner, contentStart, 'span');
    if (content === null) continue;
    const text = decodeHtmlEntities(pruneNoiseSpans(content).replace(/<[^>]+>/g, ''))
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

// ---------------------------------------------------------------------------
// Keyword / reason extraction from title
// ---------------------------------------------------------------------------

const LEADING_TAG_RE = /^\s*(?:\[[^\]]+\]|\([^)]+\))\s*/g;
const DELIMITERS = [' - ', ' – ', ' — ', ' : ', ' :: ', ' | ', ' / '];

export function extractKeywordAndReason(
  title: string,
): { keyword: string; reason: string } | null {
  let cleaned = title;
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
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    const parsed = extractKeywordAndReason(p.title);
    out.push({
      keyword: parsed?.keyword ?? p.title,
      reason: parsed?.reason ?? p.title,
      sourceUrl: p.url,
      postTitle: p.title,
      fetchedAt: now,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Post body extraction
// ---------------------------------------------------------------------------

const BODY_CLASS_CANDIDATES = ['fr-view', 'article-body', 'article-content'];
const MAX_BODY_LENGTH = 800;

export function extractArcaBody(html: string): string | null {
  const openRe = /<div\b[^>]*\bclass="([^"]*)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html)) !== null) {
    const classes = m[1].split(/\s+/);
    if (!classes.some((c) => BODY_CLASS_CANDIDATES.includes(c))) continue;
    const start = m.index + m[0].length;
    const content = balancedElementContent(html, start, 'div');
    if (content === null) continue;
    const text = htmlBodyToText(content);
    if (text) return text.length <= MAX_BODY_LENGTH ? text : `${text.slice(0, MAX_BODY_LENGTH).trimEnd()}…`;
  }
  return null;
}

function htmlBodyToText(html: string): string {
  // Strip embedded media whose fallback/alt text would otherwise leak through
  // (e.g. "귀하의 브라우저는 html5 video를 지원하지 않습니다.").
  const cleaned = html
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
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
