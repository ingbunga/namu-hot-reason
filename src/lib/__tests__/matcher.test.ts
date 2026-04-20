import { describe, expect, it } from 'vitest';
import { findReasonForKeyword, normalize } from '../matcher';
import type { ReasonEntry } from '../types';

const mk = (keyword: string, postTitle = `${keyword} - 이유`): ReasonEntry => ({
  keyword,
  reason: '이유',
  sourceUrl: 'https://example.com',
  postTitle,
  fetchedAt: 0,
});

describe('normalize', () => {
  it('removes whitespace', () => {
    expect(normalize('손 흥 민')).toBe(normalize('손흥민'));
  });
  it('removes common punctuation', () => {
    expect(normalize('A-B_C,D.E')).toBe('abcde');
  });
});

describe('findReasonForKeyword', () => {
  it('matches exact keyword', () => {
    const entries = [mk('손흥민'), mk('아이유')];
    expect(findReasonForKeyword('손흥민', entries)?.keyword).toBe('손흥민');
  });

  it('matches through normalization (spaces ignored)', () => {
    const entries = [mk('손흥민')];
    expect(findReasonForKeyword('손 흥 민', entries)?.keyword).toBe('손흥민');
  });

  it('falls back to containment', () => {
    const entries = [mk('홍길동 배우')];
    expect(findReasonForKeyword('홍길동', entries)?.keyword).toBe('홍길동 배우');
  });

  it('falls back to post title containment', () => {
    const entries: ReasonEntry[] = [
      {
        keyword: '방송',
        reason: '사건',
        sourceUrl: 'x',
        postTitle: '특정문서 관련 방송 - 사건',
        fetchedAt: 0,
      },
    ];
    expect(findReasonForKeyword('특정문서', entries)?.reason).toBe('사건');
  });

  it('returns null on miss', () => {
    expect(findReasonForKeyword('없음', [mk('다른것')])).toBeNull();
  });
});
