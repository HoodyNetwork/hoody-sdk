// GET /realms answering 2xx without a realm_ids list proves nothing about any realm: it moves no selection to all
// realms (no bump, no stored change, no notice), whether the selection was restored at boot or confirmed by an earlier
// read. The next answer that lists the realms decides, as before.
import { describe, expect, it } from 'vitest';
import { gen, realm as selected } from './ctx';
import { load, onRealmNotice, type RealmNotice } from './realm';
import { boot, onFetch, R1, R2 } from './test/env';

const aliasReply = (m: Record<string, string>) => ({ status: 200, body: { data: { value: JSON.stringify(m) } } });
const realmsAnswer = (body: unknown) => onFetch((c) => (c.url.includes('/realms') ? { status: 200, body } : aliasReply({})));
const UNLISTED: unknown[] = [{ data: {} }, { data: { realm_ids: null } }, { data: { realm_ids: 'x' } }, { data: { realm_ids: { 0: R2 } } }, {}];
function notices(): RealmNotice[] {
  const seen: RealmNotice[] = [];
  onRealmNotice((n) => { if (n.kind !== 'look') seen.push(n); });
  return seen;
}

describe('a /realms answer without a realm_ids list moves no selection', () => {
  it('a selection an earlier read listed stays, whatever the unlisted answer holds', async () => {
    boot({ realm: R2 });
    realmsAnswer({ data: { realm_ids: [R1, R2] } });
    await load();
    expect(selected()).toBe(R2);
    const seen = notices();
    const g = gen();
    for (const body of UNLISTED) {
      realmsAnswer(body);
      await load();
    }
    expect([selected(), localStorage.getItem('hub_realm_v1'), gen()]).toEqual([R2, R2, g]);
    expect(seen).toEqual([]);
  });

  it('a selection restored at boot waits for a listed answer; one that lists other realms still falls back', async () => {
    boot({ realm: R2 });
    const seen = notices();
    const g = gen();
    realmsAnswer({ data: {} });
    await load();
    expect([selected(), localStorage.getItem('hub_realm_v1'), gen()]).toEqual([R2, R2, g]);
    expect(seen).toEqual([]);
    realmsAnswer({ data: { realm_ids: [R1] } });
    await load();
    expect([selected(), localStorage.getItem('hub_realm_v1')]).toEqual(['all', 'all']);
    expect(seen.map((n) => n.kind)).toEqual(['realm-gone']);
  });
});
