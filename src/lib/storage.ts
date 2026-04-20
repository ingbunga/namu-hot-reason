import { DEFAULT_SETTINGS, type ReasonEntry, type Settings } from './types';

const KEYS = {
  settings: 'settings',
  reasons: 'reasons',
  reasonsFetchedAt: 'reasonsFetchedAt',
} as const;

export async function getSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(KEYS.settings);
  const stored = (got[KEYS.settings] ?? {}) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ [KEYS.settings]: { ...current, ...patch } });
}

export interface ReasonCache {
  entries: ReasonEntry[];
  fetchedAt: number;
}

export async function getReasonCache(): Promise<ReasonCache> {
  const got = await chrome.storage.local.get([KEYS.reasons, KEYS.reasonsFetchedAt]);
  return {
    entries: (got[KEYS.reasons] as ReasonEntry[] | undefined) ?? [],
    fetchedAt: (got[KEYS.reasonsFetchedAt] as number | undefined) ?? 0,
  };
}

export async function setReasonCache(entries: ReasonEntry[]): Promise<void> {
  await chrome.storage.local.set({
    [KEYS.reasons]: entries,
    [KEYS.reasonsFetchedAt]: Date.now(),
  });
}
