import type { ReasonEntry, Settings } from '../lib/types';

const HOST_ID = 'namu-hot-reason-card-host';

export function removeCard(): void {
  document.getElementById(HOST_ID)?.remove();
}

export function renderCard(entry: ReasonEntry, position: Settings['cardPosition']): void {
  removeCard();

  const host = document.createElement('div');
  host.id = HOST_ID;
  applyHostLayout(host, position);
  applyThemeVars(host);

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(buildStyle(), buildCard(entry));

  if (position === 'top') {
    insertAtContentTop(host);
  } else {
    document.body.appendChild(host);
  }
}

function applyHostLayout(host: HTMLElement, position: Settings['cardPosition']): void {
  if (position === 'floating') {
    host.style.position = 'fixed';
    host.style.right = '16px';
    host.style.bottom = '16px';
    host.style.zIndex = '2147483647';
    host.style.maxWidth = '380px';
    host.style.width = 'min(380px, calc(100vw - 32px))';
    return;
  }
  // 'top' — inline in the content flow; force full width across block/flex/grid parents.
  host.style.display = 'block';
  host.style.width = '100%';
  host.style.maxWidth = '100%';
  host.style.boxSizing = 'border-box';
  host.style.margin = '14px 0';
  host.style.flex = '1 1 100%';
  host.style.alignSelf = 'stretch';
  host.style.gridColumn = '1 / -1';
}

function applyThemeVars(host: HTMLElement): void {
  const body = document.body;
  if (!body) return;
  const cs = getComputedStyle(body);
  const pageBg = cs.backgroundColor;
  const pageText = cs.color;
  const dark = isColorDark(pageBg);
  host.dataset.theme = dark ? 'dark' : 'light';
  host.style.setProperty('--nhr-page-bg', pageBg);
  host.style.setProperty('--nhr-page-text', pageText);
}

function isColorDark(rgb: string): boolean {
  const m = rgb.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (!m) return false;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  // Relative luminance (sRGB)
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

function insertAtContentTop(host: HTMLElement): void {
  const h1 = findDocumentHeading();
  if (h1) {
    const target = findWidestHeaderAncestor(h1);
    target.insertAdjacentElement('afterend', host);
    return;
  }
  const root = findContentRoot();
  if (root) {
    root.insertBefore(host, root.firstChild);
    return;
  }
  document.body.insertBefore(host, document.body.firstChild);
}

// Walk up from h1 until we hit the FIRST ancestor that is meaningfully wider
// than h1. That's the wrapper escaping the narrow title column (e.g. a flex
// row with title on the left and action buttons on the right). If no such
// wrapper exists within a few steps — meaning h1 is already full-width — we
// stay at h1 and insert right after it.
function findWidestHeaderAncestor(h1: Element): Element {
  const h1Width = h1.clientWidth;
  if (h1Width === 0) return h1;
  const threshold = h1Width * 1.2;
  let current: Element = h1;
  for (let i = 0; i < 6; i++) {
    const parent = current.parentElement;
    if (!parent || parent === document.body) break;
    if (parent.tagName === 'MAIN' || parent.tagName === 'ARTICLE') break;
    if (parent.clientWidth >= threshold) return parent;
    current = parent;
  }
  return h1;
}

function findContentRoot(): Element | null {
  return (
    document.querySelector('.wiki-content-body') ??
    document.querySelector('.wiki-article') ??
    document.querySelector('main article') ??
    document.querySelector('article') ??
    document.querySelector('main')
  );
}

function findDocumentHeading(): Element | null {
  return (
    document.querySelector('main h1') ??
    document.querySelector('article h1') ??
    document.querySelector('#app h1') ??
    document.querySelector('h1')
  );
}

function buildStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      display: block;
      width: 100%;
      box-sizing: border-box;

      /* Light theme (default) */
      --nhr-card-bg: #f7f8fa;
      --nhr-card-border: #dfe3e8;
      --nhr-accent: #2f6fb5;
      --nhr-text: var(--nhr-page-text, #212529);
      --nhr-text-dim: #6c757d;
      --nhr-divider: #e5e8ec;
      --nhr-hover-bg: rgba(0, 0, 0, 0.05);
    }
    :host([data-theme="dark"]) {
      --nhr-card-bg: #2b2d31;
      --nhr-card-border: #3f4146;
      --nhr-accent: #7eb0ea;
      --nhr-text: var(--nhr-page-text, #d4d7dc);
      --nhr-text-dim: #9aa0a6;
      --nhr-divider: #3a3c40;
      --nhr-hover-bg: rgba(255, 255, 255, 0.06);
    }

    * { box-sizing: border-box; }

    .card {
      width: 100%;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                   "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
      background: var(--nhr-card-bg);
      border: 1px solid var(--nhr-card-border);
      border-left: 3px solid var(--nhr-accent);
      border-radius: 6px;
      padding: 12px 16px 14px;
      color: var(--nhr-text);
      font-size: 14px;
      line-height: 1.65;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      min-width: 0;
    }
    .label {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--nhr-accent);
      letter-spacing: 0.04em;
      flex: none;
    }
    .dot {
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: var(--nhr-text-dim);
      opacity: 0.55;
      flex: none;
    }
    .post-title {
      font-size: 13px;
      color: var(--nhr-text-dim);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1 1 auto;
      min-width: 0;
    }
    .close {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nhr-text-dim);
      font-size: 16px;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 4px;
      flex: none;
    }
    .close:hover { color: var(--nhr-text); background: var(--nhr-hover-bg); }

    .body {
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--nhr-text);
    }

    .footer {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed var(--nhr-divider);
      font-size: 12px;
      color: var(--nhr-text-dim);
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .source {
      color: var(--nhr-accent);
      text-decoration: none;
      font-weight: 500;
    }
    .source:hover { text-decoration: underline; }
    .sep { opacity: 0.5; }
  `;
  return style;
}

function buildCard(entry: ReasonEntry): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'header';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = '실검 이유';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const postTitle = document.createElement('span');
  postTitle.className = 'post-title';
  postTitle.textContent = entry.postTitle;
  postTitle.title = entry.postTitle;
  const close = document.createElement('button');
  close.className = 'close';
  close.setAttribute('aria-label', '닫기');
  close.textContent = '×';
  close.addEventListener('click', () => removeCard());
  header.append(label, dot, postTitle, close);

  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = entry.body?.trim() || entry.reason;

  const footer = document.createElement('div');
  footer.className = 'footer';
  const source = document.createElement('a');
  source.className = 'source';
  source.href = entry.sourceUrl;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = '아카라이브 원문 보기';
  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = '·';
  const meta = document.createElement('span');
  const when = new Date(entry.fetchedAt);
  meta.textContent = `${when.toLocaleString('ko-KR')} 갱신 · 사용자 제보 기반`;
  footer.append(source, sep, meta);

  card.append(header, body, footer);
  return card;
}
