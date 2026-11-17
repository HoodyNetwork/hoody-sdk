// The account the shell acts for: core's shown identity, nothing else. No session (core not booted,
// signed out, suspended) means no account, so the alert runner and hints stay idle. Fixture builds
// get their account from bootFixtureCore, which sets core's identity like a live boot.
import { useSyncExternalStore } from 'react';
import { snapshot, subscribe } from '@core/shell';

export function shownUid(): string | null {
  try {
    const id = snapshot().identity;
    return id && id.id && !id.banned ? id.id : null;
  } catch {
    return null; // core not booted: no shown account
  }
}

export function useShownUid(): string | null {
  return useSyncExternalStore(subscribe, shownUid, shownUid);
}
