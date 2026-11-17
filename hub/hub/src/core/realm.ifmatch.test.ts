// A rename's map write carries If-Match with the ETag its read answered; a 412 is shown in the kit's
// PRECONDITION_FAILED words and never retried by itself. A map read without a usable ETag is refused
// before any PUT (CAS_REQUIRED, not sent), never written without the header. A missing map (404) is created only
// (If-None-Match: *): a map made since is a 412 too, never overwritten.
import { describe, expect, it } from 'vitest';
import { outcomeOf } from './api';
import { aliases, setAlias } from './realm';
import { boot, calls, onFetch, R1, R2 } from './test/env';

const TAG = '"abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"';
const TAG2 = '"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefg"';
const map = (m: Record<string, string>) => ({ data: { value: JSON.stringify(m) } });
const puts = () => calls.filter((c) => c.method === 'PUT');

describe('aliases: rename with If-Match', () => {
  it('the map\'s ETag goes back as If-Match on its write, exactly as received', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: map({ [R2]: 'Two' }), headers: { etag: TAG } } : { status: 200, body: {}, headers: { etag: TAG2 } }));
    expect(await setAlias(R1, 'One')).toEqual({ [R2]: 'Two', [R1]: 'One' });
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.headers['if-match']).toBe(TAG);
  });
  it('a map read without an ETag is refused before any PUT (CAS_REQUIRED, not sent), the names unchanged', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: map({ [R2]: 'Two' }) } : { status: 200, body: {} }));
    const before = { ...aliases() };
    const e = await setAlias(R1, 'One').then(() => null, (x: unknown) => x);
    expect(e).toEqual({ code: 'CAS_REQUIRED', notSent: true, kind: 'not_sent' });
    expect(outcomeOf(e, true)).toBe('not_sent');
    expect(calls.map((c) => c.method)).toEqual(['GET']);
    expect(aliases()).toEqual(before);
  });
  it('no map yet (404): the first write creates it only (If-None-Match: *, no If-Match)', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 404, body: {}, headers: { etag: TAG } } : { status: 201, body: {} }));
    expect(await setAlias(R1, 'One')).toEqual({ [R1]: 'One' });
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.headers['if-match']).toBeUndefined();
    expect(puts()[0]!.headers['if-none-match']).toBe('*');
  });
  it('a map made elsewhere after the read found none: the create is a 412, sent once, never retried, nothing overwritten; the next rename keeps that map', async () => {
    boot({ realm: R1 });
    let stored: string | null = null, gets = 0;
    onFetch((c) => {
      if (c.method === 'GET') {
        const r = stored === null ? { status: 404, body: {} } : { status: 200, body: { data: { value: stored } }, headers: { etag: TAG } };
        // Another device creates the map right after this tab's first read.
        if (++gets === 1) stored = JSON.stringify({ [R2]: 'Two' });
        return r;
      }
      const ifMatch = c.headers['if-match'], create = c.headers['if-none-match'] === '*';
      if ((create && stored !== null) || (ifMatch !== undefined && ifMatch !== TAG)) return { status: 412, body: { error: 'PRECONDITION_FAILED' } };
      stored = c.body.value;
      return { status: 200, body: {} };
    });
    const before = { ...aliases() };
    const e = await setAlias(R1, 'One').then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 412, code: 'PRECONDITION_FAILED' });
    expect(outcomeOf(e, true)).toBe('failed');
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
    expect(aliases()).toEqual(before);
    expect(JSON.parse(stored!)).toEqual({ [R2]: 'Two' });
    expect(await setAlias(R1, 'One')).toEqual({ [R2]: 'Two', [R1]: 'One' });
    expect(puts().map((c) => [c.headers['if-match'], c.headers['if-none-match']])).toEqual([[undefined, '*'], [TAG, undefined]]);
    expect(JSON.parse(stored!)).toEqual({ [R2]: 'Two', [R1]: 'One' });
  });
  it('a weak or malformed ETag is never sent back: the rename is refused unsent (CAS_REQUIRED), no PUT', async () => {
    for (const bad of ['W/' + TAG, 'abc', '*', '""']) {
      boot({ realm: R1 });
      onFetch((c) => (c.method === 'GET' ? { status: 200, body: map({}), headers: { etag: bad } } : { status: 200, body: {} }));
      await expect(setAlias(R1, 'One')).rejects.toEqual({ code: 'CAS_REQUIRED', notSent: true, kind: 'not_sent' });
      expect(puts()).toHaveLength(0);
    }
  });
  it('a refused rename does not hold up the next: a later read with an ETag writes with it', async () => {
    boot({ realm: R1 });
    let g = 0;
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: map({}), ...(++g === 1 ? {} : { headers: { etag: TAG } }) } : { status: 200, body: {} }));
    await expect(setAlias(R1, 'One')).rejects.toMatchObject({ code: 'CAS_REQUIRED' });
    expect(await setAlias(R1, 'One')).toEqual({ [R1]: 'One' });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'PUT']);
    expect(puts()[0]!.headers['if-match']).toBe(TAG);
  });
  it('a 412 (changed elsewhere) is a definite refusal with its code, sent once, never retried, the names unchanged', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: map({ [R2]: 'Two' }), headers: { etag: TAG } } : { status: 412, body: { error: 'PRECONDITION_FAILED' } }));
    const before = { ...aliases() };
    const e = await setAlias(R1, 'One').then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 412, code: 'PRECONDITION_FAILED' });
    expect(outcomeOf(e, true)).toBe('failed');
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
    expect(aliases()).toEqual(before);
  });
  it('after a 412 the next rename reads the map again and sends that read\'s ETag', async () => {
    boot({ realm: R1 });
    let n = 0;
    onFetch((c) => {
      if (c.method === 'GET') return { status: 200, body: map({ [R2]: n ? 'Two' : 'Old' }), headers: { etag: n ? TAG2 : TAG } };
      return ++n === 1 ? { status: 412, body: { error: 'PRECONDITION_FAILED' } } : { status: 200, body: {} };
    });
    await setAlias(R1, 'One').catch(() => undefined);
    expect(await setAlias(R1, 'One')).toEqual({ [R2]: 'Two', [R1]: 'One' });
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'GET', 'PUT']);
    expect(puts().map((c) => c.headers['if-match'])).toEqual([TAG, TAG2]);
  });
  it('each rename sends its own read\'s ETag, never an earlier rename\'s', async () => {
    boot({ realm: R1 });
    let g = 0;
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: map({}), ...(++g === 1 ? { headers: { etag: TAG } } : { headers: { etag: TAG2 } }) } : { status: 200, body: {} }));
    await setAlias(R1, 'One');
    await setAlias(R2, 'Two');
    expect(puts().map((c) => c.headers['if-match'])).toEqual([TAG, TAG2]);
  });
  it('a later read without an ETag never borrows an earlier rename\'s: refused unsent, one PUT only', async () => {
    boot({ realm: R1 });
    let g = 0;
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: map({}), ...(++g === 1 ? { headers: { etag: TAG } } : {}) } : { status: 200, body: {} }));
    await setAlias(R1, 'One');
    await expect(setAlias(R2, 'Two')).rejects.toMatchObject({ code: 'CAS_REQUIRED', notSent: true });
    expect(puts().map((c) => c.headers['if-match'])).toEqual([TAG]);
  });
  it('a rename whose read finds no map (404) never sends an earlier rename\'s ETag', async () => {
    boot({ realm: R1 });
    let g = 0;
    onFetch((c) => (c.method === 'GET' ? (++g === 1 ? { status: 200, body: map({}), headers: { etag: TAG } } : { status: 404, body: {} }) : { status: 200, body: {} }));
    await setAlias(R1, 'One');
    await setAlias(R2, 'Two');
    expect(puts().map((c) => c.headers['if-match'])).toEqual([TAG, undefined]);
    expect(puts().map((c) => c.headers['if-none-match'])).toEqual([undefined, '*']);
  });
  it('a lost answer to the write stays pending (unknown), sent once, as today', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: map({}), headers: { etag: TAG } } : { status: 0, network: true }));
    await expect(setAlias(R1, 'One')).rejects.toMatchObject({ kind: 'pending' });
    expect(puts()).toHaveLength(1);
  });
});
