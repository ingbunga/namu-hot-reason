import { log } from '../lib/log';
import { getDocumentKeywordsFromLocation } from '../lib/namuwiki';
import { getSettings } from '../lib/storage';
import type { Message, MessageResponse } from '../lib/types';
import { removeCard, renderCard } from '../ui/card';

let lastHandledUrl: string | null = null;
let runSeq = 0;

async function run(): Promise<void> {
  const seq = ++runSeq;
  const keywords = getDocumentKeywordsFromLocation();
  const url = location.pathname + location.search;
  log.info(`content script run #${seq}, url="${url}", keywords=`, keywords);

  if (keywords.length === 0) {
    lastHandledUrl = null;
    removeCard();
    return;
  }
  if (url === lastHandledUrl) {
    log.debug(`url "${url}" already handled, skipping`);
    return;
  }
  lastHandledUrl = url;
  removeCard();

  const settings = await getSettings();
  if (!settings.enabled) {
    log.info('disabled in settings, aborting');
    return;
  }

  const req: Message = { type: 'GET_REASON', keywords };
  let res: MessageResponse | undefined;
  try {
    res = (await chrome.runtime.sendMessage(req)) as MessageResponse;
  } catch (e) {
    log.error('sendMessage failed:', e);
    return;
  }
  if (seq !== runSeq) {
    log.debug(`run #${seq} is stale (current=${runSeq}), discarding response`);
    return;
  }
  log.info('response:', res);

  if (!res || !res.ok || !res.reason) {
    log.info(`no reason to render for ${JSON.stringify(keywords)}`);
    return;
  }
  log.info(
    `rendering card for "${res.reason.keyword}" (from post: "${res.reason.postTitle}")`,
  );
  renderCard(res.reason, settings.cardPosition);
}

function installNavigationWatcher(): void {
  let lastUrl = location.pathname + location.search;

  const onMaybeNavigate = (): void => {
    const now = location.pathname + location.search;
    if (now === lastUrl) return;
    lastUrl = now;
    log.debug(`navigation detected → ${now}`);
    void run();
  };

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = function (...args) {
    const r = origPush(...(args as Parameters<typeof history.pushState>));
    queueMicrotask(onMaybeNavigate);
    return r;
  };
  history.replaceState = function (...args) {
    const r = origReplace(...(args as Parameters<typeof history.replaceState>));
    queueMicrotask(onMaybeNavigate);
    return r;
  };

  window.addEventListener('popstate', onMaybeNavigate);
  window.addEventListener('hashchange', onMaybeNavigate);
  setInterval(onMaybeNavigate, 500);
}

installNavigationWatcher();
void run();
