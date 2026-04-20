import type { ReasonEntry } from './types';

const PUNCT_RE = /[()[\]{}<>·・\-_,.!?"'「」『』【】~\/\\:;]/g;

export function normalize(s: string): string {
  return s.replace(/\s+/g, '').replace(PUNCT_RE, '').toLowerCase();
}

export function findReasonForKeyword(
  target: string,
  entries: ReasonEntry[],
): ReasonEntry | null {
  const nTarget = normalize(target);
  if (!nTarget) return null;

  // 1. exact match on normalized keyword
  for (const e of entries) {
    if (normalize(e.keyword) === nTarget) return e;
  }
  // 2. containment between keyword and target
  for (const e of entries) {
    const nk = normalize(e.keyword);
    if (!nk) continue;
    if (nk.includes(nTarget) || nTarget.includes(nk)) return e;
  }
  // 3. fallback: raw post title contains the target
  for (const e of entries) {
    if (normalize(e.postTitle).includes(nTarget)) return e;
  }
  return null;
}
