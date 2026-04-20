import {
  ARCA_LIST_URL,
  fetchArcaList,
  fetchArcaPostBody,
  postsToReasons,
} from '../lib/arca-parser';
import { log } from '../lib/log';
import { findReasonForKeyword } from '../lib/matcher';
import { getReasonCache, getSettings, setReasonCache } from '../lib/storage';
import type { Message, MessageResponse, ReasonEntry } from '../lib/types';

const REFRESH_ALARM = 'namu-hot-reason:refresh';
const BODY_FETCH_TIMEOUT_MS = 4000;
// Bump when the body parser changes so previously-cached (bad) bodies get
// re-fetched instead of being preserved across refreshes via mergeBodies.
const BODY_PARSER_VERSION = 2;
const BODY_PARSER_VERSION_KEY = 'bodyParserVersion';

function mergeBodies(
  next: ReasonEntry[],
  prev: ReasonEntry[],
): ReasonEntry[] {
  const prevByUrl = new Map(prev.map((e) => [e.sourceUrl, e]));
  return next.map((e) => {
    const old = prevByUrl.get(e.sourceUrl);
    if (old?.body) {
      return { ...e, body: old.body, bodyFetchedAt: old.bodyFetchedAt };
    }
    return e;
  });
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function ensureBody(entry: ReasonEntry): Promise<ReasonEntry> {
  if (entry.body) return entry;
  log.info(`fetching body for "${entry.keyword}" from ${entry.sourceUrl}`);
  try {
    const body = await withTimeout(
      fetchArcaPostBody(entry.sourceUrl),
      BODY_FETCH_TIMEOUT_MS,
    );
    if (!body) {
      log.warn(`body fetch timed out or empty for ${entry.sourceUrl}`);
      return entry;
    }
    log.info(`body fetched, ${body.length} chars`);
    const updated: ReasonEntry = {
      ...entry,
      body,
      bodyFetchedAt: Date.now(),
    };
    const cache = await getReasonCache();
    const merged = cache.entries.map((e) =>
      e.sourceUrl === entry.sourceUrl ? updated : e,
    );
    await setReasonCache(merged);
    return updated;
  } catch (err) {
    log.warn(`body fetch failed for ${entry.sourceUrl}:`, err);
    return entry;
  }
}

async function refreshReasons(force = false): Promise<ReasonEntry[]> {
  const settings = await getSettings();
  const cache = await getReasonCache();
  const ttlMs = Math.max(1, settings.refreshIntervalMinutes) * 60 * 1000;
  const ageMin = cache.fetchedAt
    ? Math.round((Date.now() - cache.fetchedAt) / 60000)
    : null;
  const fresh = cache.entries.length > 0 && Date.now() - cache.fetchedAt < ttlMs;

  log.info(
    `refresh start: force=${force}, cached=${cache.entries.length}, age=${ageMin}m, ttl=${settings.refreshIntervalMinutes}m, fresh=${fresh}`,
  );

  if (!force && fresh) {
    log.info('using fresh cache, skipping fetch');
    return cache.entries;
  }

  try {
    log.info(`fetching ${ARCA_LIST_URL}`);
    const posts = await fetchArcaList();
    log.info(`fetched ${posts.length} posts; sample titles:`, posts.slice(0, 5).map((p) => p.title));
    const freshEntries = postsToReasons(posts);
    const entries = mergeBodies(freshEntries, cache.entries);
    log.info(
      `parsed ${entries.length} reason entries; sample:`,
      entries.slice(0, 5).map((e) => ({ keyword: e.keyword, reason: e.reason })),
    );
    await setReasonCache(entries);
    return entries;
  } catch (err) {
    log.error('refresh failed:', err);
    return cache.entries;
  }
}

async function ensureAlarm(): Promise<void> {
  const settings = await getSettings();
  const period = Math.max(1, settings.refreshIntervalMinutes);
  const existing = await chrome.alarms.get(REFRESH_ALARM);
  if (!existing || existing.periodInMinutes !== period) {
    await chrome.alarms.clear(REFRESH_ALARM);
    chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: period });
    log.info(`alarm set, period=${period}m`);
  }
}

async function migrateCachedBodies(): Promise<void> {
  const got = await chrome.storage.local.get(BODY_PARSER_VERSION_KEY);
  const stored = got[BODY_PARSER_VERSION_KEY] as number | undefined;
  if (stored === BODY_PARSER_VERSION) return;
  const cache = await getReasonCache();
  if (cache.entries.some((e) => e.body || e.bodyFetchedAt)) {
    const stripped = cache.entries.map((e) => ({
      ...e,
      body: undefined,
      bodyFetchedAt: undefined,
    }));
    await setReasonCache(stripped);
    log.info(
      `migrated: cleared ${cache.entries.length} cached bodies (parser v${stored ?? 0} → v${BODY_PARSER_VERSION})`,
    );
  }
  await chrome.storage.local.set({ [BODY_PARSER_VERSION_KEY]: BODY_PARSER_VERSION });
}

chrome.runtime.onInstalled.addListener(() => {
  log.info('onInstalled');
  void (async () => {
    await migrateCachedBodies();
    await ensureAlarm();
    await refreshReasons(true);
  })();
});

chrome.runtime.onStartup.addListener(() => {
  log.info('onStartup');
  void (async () => {
    await migrateCachedBodies();
    await ensureAlarm();
    await refreshReasons();
  })();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    log.info('alarm fired, refreshing');
    void refreshReasons(true);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['settings']) void ensureAlarm();
});

chrome.action?.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  void (async () => {
    try {
      if (msg.type === 'GET_REASON') {
        log.info(`GET_REASON keywords=`, msg.keywords);
        const settings = await getSettings();
        if (!settings.enabled) {
          log.info('extension disabled, returning null');
          sendResponse({ ok: true, reason: null } satisfies MessageResponse);
          return;
        }
        const entries = await refreshReasons();
        let match: ReasonEntry | null = null;
        let matchedKeyword: string | null = null;
        for (const kw of msg.keywords) {
          const r = findReasonForKeyword(kw, entries);
          if (r) {
            match = r;
            matchedKeyword = kw;
            break;
          }
        }
        if (!match) {
          log.warn(
            `no match for ${JSON.stringify(msg.keywords)} in ${entries.length} entries. sample keywords:`,
            entries.slice(0, 10).map((e) => e.keyword),
          );
          sendResponse({ ok: true, reason: null } satisfies MessageResponse);
          return;
        }
        log.info(
          `match found via "${matchedKeyword}": keyword="${match.keyword}", post="${match.postTitle}", hasBody=${!!match.body}`,
        );
        const enriched = await ensureBody(match);
        sendResponse({ ok: true, reason: enriched } satisfies MessageResponse);
        return;
      }
      if (msg.type === 'REFRESH_NOW') {
        log.info('REFRESH_NOW requested');
        await refreshReasons(true);
        sendResponse({ ok: true, reason: null } satisfies MessageResponse);
        return;
      }
      sendResponse({ ok: false, error: 'unknown message' } satisfies MessageResponse);
    } catch (e: unknown) {
      log.error('message handler error:', e);
      sendResponse({ ok: false, error: String(e) } satisfies MessageResponse);
    }
  })();
  return true;
});
