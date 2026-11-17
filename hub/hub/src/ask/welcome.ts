// welcome.ts: the Agent panel's welcome note, hidden on this browser once dismissed. One flag in localStorage
// (read and written in try/catch); only a browser that refuses the write keeps the note hidden for this page alone,
// so a stored flag removed later (another tab, storage cleared) shows the note again. The flag holds no account data
// and no secret, so it is per browser, not per account.
import { useSyncExternalStore } from 'react';
import { hostEnv } from '@core';

export const WELCOME_KEY = 'hub.v3.agentNote.hidden';

let pageHidden = false;
const subs = new Set<() => void>();

export function welcomeHidden(): boolean {
  if (pageHidden) return true;
  try { return hostEnv().local?.getItem(WELCOME_KEY) === '1'; } catch { return false; }
}

export function hideWelcome(): void {
  try {
    const local = hostEnv().local;
    if (!local) throw new Error('no storage');
    local.setItem(WELCOME_KEY, '1'); pageHidden = false;
  } catch { pageHidden = true; }
  for (const fn of subs) fn();
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  // Another tab's dismissal, or the flag removed or storage cleared there, shows here without a reload.
  const off = hostEnv().onExternalChange((area, key) => { if (area === 'local' && (key === WELCOME_KEY || key === null)) fn(); });
  return () => { subs.delete(fn); off(); };
}

export function useWelcomeHidden(): boolean {
  return useSyncExternalStore(subscribe, welcomeHidden, welcomeHidden);
}

/** Tests only. */
export function resetWelcomeForTests(): void {
  pageHidden = false;
}
