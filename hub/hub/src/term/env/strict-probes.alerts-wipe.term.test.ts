// core/alerts.ts and core/local-wipe.ts read the host only through hostEnv() (Notifications'
// BrowserCard and Account's data reached them). Under the strict globals, with no page host (a terminal), none of
// these reads a browser global: alerts read as unsupported, isAway is false, the wipe's store check names no database
// or cache (the host has none).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | readEnv / showAlert (its default Notification, as enableAlerts') / isAway with the defaults: unsupported, no trap | 'alerts read no global' |
// | 2 | uncheckedStores reads the host's stores only: no 'databases' or 'caches' entry, no trap | 'wipe check reads no global' |
import { expect, test } from 'bun:test';
import { isAway, readEnv, showAlert } from '../../core/alerts';
import { uncheckedStores } from '../../core/local-wipe';
import { activeStrictGlobals } from './strict-globals';

test('alerts read no global', async () => {
  const sg = activeStrictGlobals();
  expect(sg).not.toBeNull();
  sg!.clear();
  expect(readEnv().hasNotification).toBe(false);
  expect(await showAlert({ title: 't', body: 'b' })).toEqual({ ok: false, reason: 'unsupported' });
  expect(isAway()).toBe(false);
  expect(sg!.ledger()).toEqual([]);
});

test('wipe check reads no global', async () => {
  const sg = activeStrictGlobals()!;
  sg.clear();
  const what = await uncheckedStores('u1', { deadline: Date.now() + 1000 });
  expect(what).not.toContain('databases');
  expect(what).not.toContain('caches');
  expect(sg.ledger()).toEqual([]);
});
