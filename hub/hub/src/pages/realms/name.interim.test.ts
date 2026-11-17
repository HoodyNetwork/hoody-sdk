// The name write: core runs this tab's renames one at a time, refuses a name another realm has and a names read
// without a usable ETag (CAS_REQUIRED, before any PUT), and writes with If-Match; the page starts nothing once it is
// left (a name write already started may still send and land after leaving), a PUT whose answer is lost or late
// reads as "may not have saved" (never failed), and NAME_TAKEN and CAS_REQUIRED stay refusals made before sending.
import { answers, bootFixtureCore, reply, vaultKeyPutRoute, vaultKeyRoute, type FixtureRequest } from '@core';
import { describe, expect, it } from 'vitest';
import { liveIo, nameOutcome, type SetRealms } from './data';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const m: SetRealms = { mutateAsync: async () => ({ outcome: 'done' }), holdOf: async () => undefined, heldByOther: async () => undefined, complete: async () => false, dismiss: async () => false };

// noEtag: the names read answers without the ETag the API sends.
function boot(o: { put?: 'ok' | 'pending'; map?: Record<string, string>; slowRead?: boolean; noEtag?: boolean } = {}) {
  const puts: unknown[] = [];
  const names = { data: { key: 'realm_aliases', value: JSON.stringify(o.map ?? {}) } };
  const read = o.slowRead ? answers.slow(names, 200) : answers.ok(names);
  bootFixtureCore({
    rules: [
      reply(vaultKeyRoute, o.noEtag ? read : { ...read, headers: { etag: '"names-v1"' } }),
      reply(vaultKeyPutRoute, (r: FixtureRequest) => { puts.push(r.body); return o.put === 'pending' ? answers.pending5xx(502) : answers.ok({ data: { key: 'realm_aliases' } }); }),
    ],
  });
  return puts;
}

describe('the name write', () => {
  it('sends nothing once the page is left', async () => {
    const puts = boot();
    expect(await liveIo(m, () => false).setName(A, 'Clients')).toEqual({ outcome: 'failed', notSent: true });
    expect(puts).toEqual([]);
  });

  it('saves once while the page is open', async () => {
    const puts = boot();
    expect(await liveIo(m, () => true).setName(A, 'Clients')).toEqual({ outcome: 'done' });
    expect(puts).toHaveLength(1);
  });

  it('a name another realm has is refused before any write', async () => {
    const puts = boot({ map: { [B]: 'clients' } });
    expect(await liveIo(m, () => true).setName(A, 'Clients')).toMatchObject({ outcome: 'failed', code: 'NAME_TAKEN', notSent: true });
    expect(puts).toEqual([]);
  });

  it('a names read without an ETag is refused before any write (CAS_REQUIRED, not sent)', async () => {
    const puts = boot({ noEtag: true });
    expect(await liveIo(m, () => true).setName(A, 'Clients')).toEqual({ outcome: 'failed', code: 'CAS_REQUIRED', notSent: true });
    expect(puts).toEqual([]);
  });

  it('a lost PUT answer is unknown (may not have saved), never failed, and is sent once', async () => {
    const puts = boot({ put: 'pending' });
    expect(await liveIo(m, () => true).setName(A, 'Clients')).toEqual({ outcome: 'unknown' });
    expect(puts).toHaveLength(1);
  });

  it('leaving while core reads the names does not stop a name already started: its PUT may still go (the leave warning says so)', async () => {
    const puts = boot({ slowRead: true });
    let open = true;
    const sent = liveIo(m, () => open).setName(A, 'Clients');
    open = false;
    await sent;
    expect(puts).toHaveLength(1);
  });

  it('a late answer (core\'s bound) is pending: unknown', () => {
    expect(nameOutcome({ kind: 'pending', pending: true })).toEqual({ outcome: 'unknown' });
    expect(nameOutcome({ status: 504 })).toEqual({ outcome: 'unknown' });
    expect(nameOutcome({ status: 400, code: 'BAD' })).toEqual({ outcome: 'failed', code: 'BAD', error: { status: 400, code: 'BAD' } });
  });
});
