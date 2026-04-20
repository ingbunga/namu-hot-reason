export interface ReasonEntry {
  keyword: string;
  reason: string;
  sourceUrl: string;
  postTitle: string;
  fetchedAt: number;
  body?: string;
  bodyFetchedAt?: number;
}

export interface ArcaPost {
  title: string;
  url: string;
  postedAt?: string;
}

export interface Settings {
  enabled: boolean;
  refreshIntervalMinutes: number;
  cardPosition: 'top' | 'floating';
}

export type Message =
  | { type: 'GET_REASON'; keywords: string[] }
  | { type: 'REFRESH_NOW' };

export type MessageResponse =
  | { ok: true; reason: ReasonEntry | null }
  | { ok: false; error: string };

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  refreshIntervalMinutes: 10,
  cardPosition: 'top',
};
