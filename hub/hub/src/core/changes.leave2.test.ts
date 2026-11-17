// forgetAccountChanges reports how many of the shown holds its removal took out of storage. A shown send
// still out is kept, so it is not counted even when the same turn removes the account's other records.
import { afterEach, describe, expect, it } from 'vitest';
import * as C from './changes';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY } from './change-store';
import { snapshot } from './ctx';
import { boot, R1 } from './test/env';

afterEach(() => { localStorage.removeItem(CHANGE_STORE_KEY); });

describe('forgetAccountChanges out.removedShown', () => {
  it('a kept key removed, the only shown hold a send still out: 0 shown removed', async () => {
    boot({ realm: R1 });
    const account = String(snapshot().account);
    const own = account + '\u0001';
    const sendId = ATTEMPT_PREFIX + own + 'keys:create';
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([{ id: own + 's\u0000k', pending: false, t: 1, key: 'kept' }]));
    C.reloadChangesForTests();
    const shown = [{ id: sendId, token: '', sending: true as const }];
    const out = { removedShown: 0 };
    const r = await C.forgetAccountChanges(account, shown, { holdsIn: () => shown, drop: () => {} }, out);
    expect(r).toBe('done');
    expect(JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]')).toEqual([]);
    expect(out.removedShown).toBe(0);
  });

  it('a shown pending hold removed: counted', async () => {
    boot({ realm: R1 });
    const account = String(snapshot().account);
    await C.guarded('s', 'k', async () => ({ outcome: 'pending' as const }), { base: 'lock:leave2.raw', target: null, realm: R1, by: 'q:leave2@leave2.raw' });
    const shown = C.changeHoldRefs();
    expect(shown).toHaveLength(1);
    const out = { removedShown: 0 };
    expect(await C.forgetAccountChanges(account, shown, { holdsIn: () => [], drop: () => {} }, out)).toBe('done');
    expect(out.removedShown).toBe(1);
  });
});
