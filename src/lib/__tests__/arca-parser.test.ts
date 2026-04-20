import { describe, expect, it } from 'vitest';
import {
  extractArcaBody,
  extractKeywordAndReason,
  parseArcaListHtml,
  postsToReasons,
} from '../arca-parser';

describe('extractKeywordAndReason', () => {
  it('parses " - " delimiter', () => {
    expect(extractKeywordAndReason('아이유 - 신곡 발매')).toEqual({
      keyword: '아이유',
      reason: '신곡 발매',
    });
  });

  it('strips a leading [tag] before splitting', () => {
    expect(extractKeywordAndReason('[실검] 손흥민 - 해트트릭 기록')).toEqual({
      keyword: '손흥민',
      reason: '해트트릭 기록',
    });
  });

  it('strips multiple leading tags', () => {
    expect(
      extractKeywordAndReason('[속보][실검] 어떤키워드 - 어떤사건'),
    ).toEqual({ keyword: '어떤키워드', reason: '어떤사건' });
  });

  it('handles em-dash and colon delimiters', () => {
    expect(extractKeywordAndReason('영화제목 — 개봉일 공개')?.keyword).toBe('영화제목');
    expect(extractKeywordAndReason('인물 : 논란')?.reason).toBe('논란');
  });

  it('returns null when there is no usable delimiter', () => {
    expect(extractKeywordAndReason('그냥제목')).toBeNull();
  });

  it('returns null when keyword or reason side is empty', () => {
    expect(extractKeywordAndReason(' - 이유만 있음')).toBeNull();
    expect(extractKeywordAndReason('키워드만 - ')).toBeNull();
  });
});

describe('parseArcaListHtml', () => {
  it('parses vrow anchors and skips notices', () => {
    const html = `
      <a class="vrow notice" href="/b/namuhotnow/1"><span class="title">공지</span></a>
      <a class="vrow column" href="/b/namuhotnow/100">
        <div>
          <span class="vcol col-title">
            <span class="title preview-image">
              아이유 - 신곡 발매
              <span class="comment-count">[3]</span>
            </span>
          </span>
          <time datetime="2026-04-20T12:00:00Z">방금</time>
        </div>
      </a>
      <a class="vrow column" href="https://arca.live/b/namuhotnow/101">
        <span class="title">손흥민 &amp; 해트트릭 - 프리미어리그 기록</span>
      </a>
    `;
    const posts = parseArcaListHtml(html);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      title: '아이유 - 신곡 발매',
      url: 'https://arca.live/b/namuhotnow/100',
      postedAt: '2026-04-20T12:00:00Z',
    });
    expect(posts[1]).toMatchObject({
      title: '손흥민 & 해트트릭 - 프리미어리그 기록',
      url: 'https://arca.live/b/namuhotnow/101',
    });
  });

  it('dedupes by href', () => {
    const html = `
      <a class="vrow" href="/b/namuhotnow/1"><span class="title">A - B</span></a>
      <a class="vrow" href="/b/namuhotnow/1"><span class="title">A - B</span></a>
    `;
    expect(parseArcaListHtml(html)).toHaveLength(1);
  });
});

describe('extractArcaBody', () => {
  it('extracts text from fr-view', () => {
    const html = `
      <div class="article-body">
        <div class="fr-view article-content">
          <p>첫 번째 단락입니다.</p>
          <p>두 번째 단락 <b>강조</b> 텍스트.</p>
          <p>줄바꿈<br>테스트</p>
        </div>
      </div>
    `;
    const text = extractArcaBody(html);
    expect(text).toContain('첫 번째 단락입니다.');
    expect(text).toContain('두 번째 단락 강조 텍스트.');
    expect(text).toContain('줄바꿈');
    expect(text).toContain('테스트');
  });

  it('decodes entities and strips scripts', () => {
    const html = `
      <div class="fr-view">
        <script>alert('x')</script>
        <p>&lt;hello&gt; &amp; world</p>
      </div>
    `;
    const text = extractArcaBody(html) ?? '';
    expect(text).not.toContain('alert');
    expect(text).toContain('<hello> & world');
  });

  it('strips video/audio/iframe fallback text', () => {
    const html = `
      <div class="fr-view">
        <p>앞 내용</p>
        <video src="a.mp4" controls>
          귀하의 브라우저는 html5 video를 지원하지 않습니다.
        </video>
        <audio><source src="a.mp3"/>Your browser does not support audio.</audio>
        <iframe src="x"><p>no iframe fallback</p></iframe>
        <p>뒤 내용</p>
      </div>
    `;
    const text = extractArcaBody(html) ?? '';
    expect(text).toContain('앞 내용');
    expect(text).toContain('뒤 내용');
    expect(text).not.toContain('html5');
    expect(text).not.toContain('browser does not support');
    expect(text).not.toContain('iframe fallback');
  });

  it('returns null when no body container found', () => {
    expect(extractArcaBody('<div>nothing here</div>')).toBeNull();
  });

  it('falls back to article-body if fr-view missing', () => {
    const html = `<div class="article-body"><p>본문 텍스트</p></div>`;
    expect(extractArcaBody(html)).toContain('본문 텍스트');
  });
});

describe('postsToReasons', () => {
  it('parses delimited titles', () => {
    const entries = postsToReasons([
      { title: '아이유 - 신곡', url: 'https://arca.live/b/namuhotnow/1' },
    ]);
    expect(entries[0].keyword).toBe('아이유');
    expect(entries[0].reason).toBe('신곡');
  });

  it('keeps undelimited titles as both keyword and reason (for fallback matching)', () => {
    const entries = postsToReasons([
      { title: '그냥제목', url: 'https://arca.live/b/namuhotnow/2' },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].keyword).toBe('그냥제목');
    expect(entries[0].reason).toBe('그냥제목');
  });

  it('dedupes by source URL', () => {
    const entries = postsToReasons([
      { title: '아이유 - 신곡', url: 'https://arca.live/b/namuhotnow/1' },
      { title: '아이유 - 다른설명', url: 'https://arca.live/b/namuhotnow/1' },
    ]);
    expect(entries).toHaveLength(1);
  });
});
