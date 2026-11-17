// The checker's realm on the wire. Settings → Advanced sent Global as "no realm"; with no realm a call takes the top bar's
// realm, and All realms is refused for this route, so the checker of a computer in no realm could not be saved under All
// realms. One rule (checkerWireRealm) now serves the page's read and the row's save and Check again; the answer is judged
// for the settings' own realm.
import { describe, expect, it } from 'vitest';
import type { Api } from './api';
import { checkerWireRealm, confirmChecker, setChecker } from './flows-checker';
import type { Settled } from './types';

const R1 = 'a'.repeat(24);
const ok = (body: unknown = {}): Settled<unknown> => ({ ok: true, body });

/** jevPut and jev only, each recording the realm it was sent with. */
function fakeApi(read: Settled<unknown>) {
  const sent: Array<{ name: string; realm: string | null }> = [];
  const api = {
    jevPut: (realm: string | null) => {
      sent.push({ name: 'jevPut', realm });
      return Promise.resolve(ok());
    },
    jev: (realm: string | null) => {
      sent.push({ name: 'jev', realm });
      return Promise.resolve(read);
    },
  } as unknown as Api;
  return { api, sent };
}

describe('the checker realm on the wire', () => {
  it('Global goes as "global" to an agent with per-realm settings; only an agent without them sends no realm', () => {
    expect(checkerWireRealm('global', true)).toBe('global');
    expect(checkerWireRealm('global', false)).toBeNull();
    expect(checkerWireRealm(R1, true)).toBe(R1);
    expect(checkerWireRealm(R1, false)).toBe(R1);
    expect(checkerWireRealm(null, true)).toBeNull();
  });

  it('a save on Global with per-realm settings is sent and read back with realm "global"', async () => {
    const guard = { realm: 'global', realmSettings: true };
    const f = fakeApi(ok({ effective: { enabled: true, usable: true } }));
    expect(await setChecker(f.api, checkerWireRealm(guard.realm, guard.realmSettings), guard, { enabled: true })).toEqual({ state: 'saved' });
    expect(f.sent).toEqual([{ name: 'jevPut', realm: 'global' }, { name: 'jev', realm: 'global' }]);
  });

  it('Check again on an agent without per-realm settings judges the Global answer (sent with no realm) as Global', async () => {
    const guard = { realm: 'global', realmSettings: false };
    const f = fakeApi(ok({ effective: { enabled: false } }));
    expect(await confirmChecker(f.api, checkerWireRealm(guard.realm, guard.realmSettings), guard, { enabled: false })).toEqual({ state: 'saved' });
    expect(f.sent).toEqual([{ name: 'jev', realm: null }]);
  });
});
