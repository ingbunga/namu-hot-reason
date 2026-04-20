import { getSettings, setSettings } from '../lib/storage';
import type { Message, Settings } from '../lib/types';

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`element not found: ${id}`);
  return el as T;
}

async function load(): Promise<void> {
  const s = await getSettings();
  byId<HTMLInputElement>('enabled').checked = s.enabled;
  byId<HTMLInputElement>('refreshIntervalMinutes').value = String(s.refreshIntervalMinutes);
  byId<HTMLSelectElement>('cardPosition').value = s.cardPosition;
}

function flash(text: string): void {
  const el = byId('status');
  el.textContent = text;
  if (text) setTimeout(() => (el.textContent = ''), 2000);
}

byId('save').addEventListener('click', async () => {
  const interval = Number(byId<HTMLInputElement>('refreshIntervalMinutes').value);
  const patch: Partial<Settings> = {
    enabled: byId<HTMLInputElement>('enabled').checked,
    refreshIntervalMinutes: Number.isFinite(interval) && interval > 0 ? interval : 10,
    cardPosition: byId<HTMLSelectElement>('cardPosition').value as Settings['cardPosition'],
  };
  await setSettings(patch);
  flash('저장됨');
});

byId('refresh').addEventListener('click', async () => {
  const msg: Message = { type: 'REFRESH_NOW' };
  try {
    await chrome.runtime.sendMessage(msg);
    flash('갱신 요청 완료');
  } catch {
    flash('갱신 실패');
  }
});

void load();
