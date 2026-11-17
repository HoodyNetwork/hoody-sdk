// Covers a server that returns no ETag, where a tab runs its renames one at a time, so two renames
// from one tab that both get their answers never lose one; a name another realm already has (folded as the alias
// rules fold) is refused with NAME_TAKEN before any PUT. Without an ETag, a rename in another tab or device at the
// same moment, or this tab's earlier PUT whose answer was lost, can still lose one; with an ETag the server refuses
// it (realm.ifmatch.test.ts).
import { describe, expect, it, vi } from 'vitest';
import * as core from './index';
import { endAccount, setAlias } from './realm';
import { boot, calls, deferred, onFetch, R1, R2, settle } from './test/env';

const R3 = 'ccccccccccccccccccccccc3';
const isPut = (c: { method: string; url: string }): boolean => c.method === 'PUT' && c.url.includes('/vault/keys/');
// The ETag the API answers with on an alias map read (a rename refuses a read without one).
const TAG = { etag: '"v1"' };
/** A vault holding the alias map: GET reads it with its version's ETag, PUT replaces it only over that version (412
 *  otherwise), as the API does (each answer after a turn, so calls can overlap). */
function vault(start: Record<string, string>, fail?: (n: number) => boolean) {
  let map = { ...start }, puts = 0, ver = 1;
  onFetch(async (c) => {
    await settle();
    if (!c.url.includes('/vault/keys/')) return { status: 200, body: { data: {} } };
    if (c.method === 'GET') return { status: 200, body: { data: { value: JSON.stringify(map) } }, headers: { etag: `"v${ver}"` } };
    puts++;
    if (fail?.(puts)) return { status: 503, body: {} };
    if (c.headers['if-match'] !== `"v${ver}"`) return { status: 412, body: { error: 'PRECONDITION_FAILED' } };
    ver++;
    map = JSON.parse(String((c.body as { value: string }).value)) as Record<string, string>;
    return { status: 200, body: { data: {} } };
  });
  return { map: () => map };
}

describe('renames from one tab, one at a time; a taken name is refused unsent', () => {
  it('two renames started together from one tab both stay', async () => {
    boot({ realm: 'all' });
    const v = vault({});
    const [a, b] = await Promise.all([setAlias(R1, 'One'), setAlias(R2, 'Two')]);
    expect(a).toEqual({ [R1]: 'One' });
    expect(b).toEqual({ [R1]: 'One', [R2]: 'Two' });
    expect(v.map()).toEqual({ [R1]: 'One', [R2]: 'Two' });
    expect(core.realmAliases()).toEqual({ [R1]: 'One', [R2]: 'Two' });
  });
  it('a name another realm has, folded (case, spaces, invisible marks), is refused NAME_TAKEN and nothing is written', async () => {
    boot({ realm: 'all' });
    const v = vault({ [R1]: 'Prod' });
    await expect(setAlias(R2, '  pr​OD ')).rejects.toMatchObject({ code: 'NAME_TAKEN', id: R1, notSent: true });
    expect(calls.filter(isPut)).toEqual([]);
    expect(v.map()).toEqual({ [R1]: 'Prod' });
  });
  it('a realm keeps its own name, another casing of it included, and clearing a name is never taken', async () => {
    boot({ realm: 'all' });
    const v = vault({ [R1]: 'Prod', [R2]: 'Two' });
    expect(await setAlias(R1, 'PROD')).toEqual({ [R1]: 'PROD', [R2]: 'Two' });
    expect(await setAlias(R2, '')).toEqual({ [R1]: 'PROD' });
    expect(v.map()).toEqual({ [R1]: 'PROD' });
  });
  it('clearing a name is never taken, even beside a stored name that folds to nothing', async () => {
    boot({ realm: 'all' });
    const v = vault({ [R1]: ' ', [R2]: 'Two' });
    expect(await setAlias(R2, '')).toEqual({ [R1]: ' ' });
    expect(v.map()).toEqual({ [R1]: ' ' });
  });
  it('a nonempty name that folds to nothing is taken by another realm\'s name that folds to nothing too', async () => {
    boot({ realm: 'all' });
    const v = vault({ [R1]: ' ' });
    await expect(setAlias(R2, '\u200b')).rejects.toMatchObject({ code: 'NAME_TAKEN', id: R1, notSent: true });
    expect(calls.filter(isPut)).toEqual([]);
    expect(v.map()).toEqual({ [R1]: ' ' });
  });
  it('the check reads the map the rename writes over: a name taken by the rename queued before it is refused', async () => {
    boot({ realm: 'all' });
    const v = vault({});
    const first = setAlias(R1, 'Same');
    const second = setAlias(R3, 'same');
    expect(await first).toEqual({ [R1]: 'Same' });
    await expect(second).rejects.toMatchObject({ code: 'NAME_TAKEN', id: R1 });
    expect(v.map()).toEqual({ [R1]: 'Same' });
  });
  it('a rename that fails does not hold up the next one', async () => {
    boot({ realm: 'all' });
    const v = vault({}, (n) => n === 1);
    const first = setAlias(R1, 'One');
    const second = setAlias(R2, 'Two');
    await expect(first).rejects.toBeTruthy();
    expect(await second).toEqual({ [R2]: 'Two' });
    expect(v.map()).toEqual({ [R2]: 'Two' });
  });
  it('a queued rename keeps the context it was called in: queued across a sign-out, it sends nothing', async () => {
    boot({ realm: 'all' });
    const hold = deferred();
    onFetch(async (c) => {
      if (!c.url.includes('/vault/keys/')) return { status: 200, body: { data: {} } };
      await hold.p;
      return { status: 200, body: { data: { value: '{}' } }, headers: TAG };
    });
    const first = setAlias(R1, 'One');
    await settle();
    const second = setAlias(R2, 'Two');
    endAccount('signout');
    hold.res();
    await expect(first).rejects.toBeTruthy();
    await expect(second).rejects.toBeTruthy();
    expect(calls.filter((c) => c.url.includes('/vault/keys/')).length).toBe(1);
    expect(core.realmAliases()).toEqual({});
  });
});

// A stalled answer never holds this tab's rename queue. A GET past
// the bound rejects as any failed read (nothing written); a PUT past it rejects pending ("may have gone through",
// never failed); the next rename runs either way.
describe('bounded wait: a stalled rename frees the queue', () => {
  const hang = <T,>(): Promise<T> => new Promise<T>(() => {});
  it('a GET that never answers rejects as a failed read, writes nothing, and the next rename goes through', async () => {
    boot({ realm: 'all' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let stall = true;
      const map: Record<string, string> = {};
      onFetch((c) => {
        if (!c.url.includes('/vault/keys/')) return { status: 200, body: { data: {} } };
        if (c.method === 'GET') return stall ? hang() : { status: 200, body: { data: { value: JSON.stringify(map) } }, headers: TAG };
        Object.assign(map, JSON.parse(String((c.body as { value: string }).value)));
        return { status: 200, body: { data: {} } };
      });
      const first = setAlias(R1, 'One').then(() => 'ok', (e: unknown) => e);
      const second = setAlias(R2, 'Two');
      await vi.advanceTimersByTimeAsync(14000);
      expect(calls.filter(isPut)).toEqual([]);
      stall = false;
      await vi.advanceTimersByTimeAsync(7000);
      // The vault route is secret, so the read's error is bare (as any failed read of the map): nothing was written.
      const e = await first;
      expect(e).not.toBe('ok');
      expect(e).toMatchObject({ status: 0 });
      expect((e as { kind?: string }).kind).not.toBe('pending');
      expect(await second).toEqual({ [R2]: 'Two' });
      expect(calls.filter(isPut).length).toBe(1);
    } finally { vi.useRealTimers(); }
  });
  it('a PUT that never answers rejects pending, never failed, and the next rename goes through', async () => {
    boot({ realm: 'all' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let puts = 0;
      onFetch((c) => {
        if (!c.url.includes('/vault/keys/')) return { status: 200, body: { data: {} } };
        if (c.method === 'GET') return { status: 200, body: { data: { value: '{}' } }, headers: TAG };
        puts++;
        return puts === 1 ? hang() : { status: 200, body: { data: {} } };
      });
      const first = setAlias(R1, 'One').then(() => 'ok', (e: unknown) => e);
      const second = setAlias(R2, 'Two');
      await vi.advanceTimersByTimeAsync(14000);
      expect(puts).toBe(1);
      await vi.advanceTimersByTimeAsync(7000);
      const e = await first;
      expect(e).toMatchObject({ kind: 'pending', pending: true });
      expect((e as { kind?: string }).kind).not.toBe('failed');
      expect(await second).toEqual({ [R2]: 'Two' });
      expect(puts).toBe(2);
    } finally { vi.useRealTimers(); }
  });
});

