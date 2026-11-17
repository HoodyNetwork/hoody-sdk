// secret.ts: a minted secret's custody (bind, shown, drop, watch) and the
// scrubMint cases of a Bot key.
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bump, capture, setView, startLoggingOut } from './ctx';
import { onPending, type PendingNotice } from './api';
import { endAccount, switchTo } from './realm';
import { defineRoute } from './routes';
import { holdSecret, mintSecret, scrubMint, scrubSecret, useSecret, type HeldSecret } from './secret';
import { boot, calls, deferred, onFetch, OTHER, R1, R2, settle, signIn } from './test/env';

const SECRET = 'hdy_T' + 'x'.repeat(40);
const mintRoute = defineRoute<{ data?: { id?: string; token?: string } }, { name: string }>({ method: 'POST', path: '/auth/tokens', scope: 'base', body: ['name'], secret: true, codes: ['NAME_TAKEN'] });
const plainRoute = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/auth/plain', scope: 'base', body: ['name'] });
const pick = (r: { data?: { token?: string } }) => r && r.data && r.data.token;
const answer = () => ({ statusCode: 201, data: { id: 'f'.repeat(24), alias: 'codex', prefix: 'hdy_', token: SECRET, curl: 'curl -H "Authorization: Bearer ' + SECRET + '"' }, meta: { hint: 'use ' + SECRET } });

function holds(o: unknown, depth = 0): boolean {
  if (typeof o === 'string') return o.includes(SECRET);
  if (!o || typeof o !== 'object' || depth > 10) return false;
  return Object.values(o as Record<string, unknown>).some((v) => holds(v, depth + 1));
}
// What the scrub saw: the parsed answers themselves (the test's own object is only serialized).
const seenRaw: unknown[] = [];
const pickSeen = (r: { data?: { token?: string } }) => { seenRaw.push(r); return pick(r); };
/** An answer arrived and no copy of the secret is left in it. */
const rawWiped = () => seenRaw.length > 0 && !holds(seenRaw);
const settled = <T,>(p: Promise<T>) => p.then((v) => ({ ok: v }), (e) => e);
function pendings(): PendingNotice[] {
  const seen: PendingNotice[] = [];
  onPending((n) => seen.push(n));
  return seen;
}

describe('scrubMint / scrubSecret', () => {
  it('nulls secret, every curl* key and any string holding the secret; keeps the rest', () => {
    const o = { id: 'k1', secret: SECRET, curl: 'x', curl_chat: 'y', nested: { note: 'a ' + SECRET + ' b', name: 'kept' }, list: [{ v: SECRET }] };
    scrubSecret(o, SECRET);
    expect(o).toEqual({ id: 'k1', secret: null, curl: null, curl_chat: null, nested: { note: null, name: 'kept' }, list: [{ v: null }] });
  });
  it('follows and cuts the mint chain, finding the secret anywhere on it', () => {
    const raw = { data: { token: SECRET } };
    const m: Record<string, unknown> = { key: { id: 'k' }, mint: { secret: SECRET, mint: raw } };
    scrubMint(m);
    expect(m.mint).toBeNull();
    expect(holds(raw)).toBe(false);
  });
  it('a cycle or a deep tree ends', () => {
    const a: Record<string, unknown> = { secret: SECRET };
    a.mint = a;
    expect(() => scrubMint(a)).not.toThrow();
    let deep: Record<string, unknown> = { v: SECRET };
    for (let i = 0; i < 20; i++) deep = { d: deep };
    expect(() => scrubSecret(deep, SECRET)).not.toThrow();
    const b: Record<string, unknown> = { note: SECRET };
    b.self = { back: b };
    expect(() => scrubSecret(b, SECRET)).not.toThrow();
    expect(b.note).toBeNull();
  });
  it('a copy at any depth is nulled: a deep answer is scrubbed whole', () => {
    let deep: Record<string, unknown> = { v: 'a ' + SECRET, curl: 'x', secret: SECRET, kept: 'k' };
    const leaf = deep;
    for (let i = 0; i < 40; i++) deep = { d: deep, list: [{ curl_cmd: 'y' }] };
    scrubSecret(deep, SECRET);
    expect(leaf).toEqual({ v: null, curl: null, secret: null, kept: 'k' });
    let o: unknown = deep;
    for (let i = 0; i < 40; i++) {
      const r = o as { d: unknown; list: Array<{ curl_cmd: unknown }> };
      expect(r.list[0]!.curl_cmd).toBeNull();
      o = r.d;
    }
    expect(o).toBe(leaf);
  });
});

describe('mintSecret', () => {
  it('one send; the secret comes back once, held; the raw answer keeps no copy', async () => {
    boot({ realm: R1 });
    const raw = answer();
    onFetch(() => ({ status: 201, body: raw }));
    const ctx = capture();
    seenRaw.length = 0;
    const m = await mintSecret(mintRoute, { body: { name: 'codex' }, ctx }, pickSeen);
    expect(calls.length).toBe(1);
    expect(rawWiped()).toBe(true);
    expect(m.held!.reveal(ctx)).toBe(SECRET);
    expect(holds(m.answer)).toBe(false);
    expect(m.answer.data!.id).toBe('f'.repeat(24));
  });
  it('a route not declared secret, or a scrub of the caller\'s own, is refused unsent', async () => {
    boot({ realm: R1 });
    expect(await settled(mintSecret(plainRoute, { body: { name: 'a' } }, () => SECRET))).toMatchObject({ kind: 'not_sent', code: 'SECRET_ROUTE' });
    expect(await settled(mintSecret(mintRoute, { body: { name: 'a' }, scrub: () => {} }, pick))).toMatchObject({ kind: 'not_sent', code: 'SCRUB_OWN' });
    expect(calls.length).toBe(0);
  });
  it('a context already gone sends nothing', async () => {
    boot({ realm: R1 });
    const ctx = capture();
    await switchTo(R2);
    calls.length = 0;
    expect(await settled(mintSecret(mintRoute, { body: { name: 'a' }, ctx }, pick))).toMatchObject({ kind: 'not_sent' });
    expect(calls.length).toBe(0);
  });
  it('made but no secret in the answer: held is null, the answer is there', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 201, body: { data: { id: 'e'.repeat(24) } } }));
    const m = await mintSecret(mintRoute, { body: { name: 'a' } }, pick);
    expect(m.held).toBeNull();
    expect(m.answer.data!.id).toBe('e'.repeat(24));
  });
  for (const [how, change] of [
    ['a realm switch', () => switchTo(R2)],
    ['another account', () => { signIn(OTHER, 'sid-b'); }],
    ['sign-out', () => { startLoggingOut(); }],
  ] as const) {
    it(`${how} while the answer is on its way: pending, one notice, the raw answer and the copy wiped`, async () => {
      boot({ realm: R1 });
      seenRaw.length = 0;
      const seen = pendings();
      const raw = answer();
      const d = deferred();
      onFetch(async (c) => { if (c.url.endsWith('/auth/tokens')) await d.p; return { status: 201, body: raw }; });
      const p = settled(mintSecret(mintRoute, { body: { name: 'a' } }, pickSeen));
      await settle();
      await change();
      d.res();
      const r = await p;
      expect(r).toMatchObject({ kind: 'pending', pending: true });
      expect([rawWiped(), holds(r)]).toEqual([true, false]);
      expect(seen.length).toBe(1);
    });
  }
  it('the context dies after the answer was let through: dropped unseen, pending STALE_CONTEXT, one notice', async () => {
    boot({ realm: R1 });
      seenRaw.length = 0;
    const seen = pendings();
    const raw = answer();
    onFetch(() => ({ status: 201, body: raw }));
    const p = settled(mintSecret(mintRoute, { body: { name: 'a' }, scrub: undefined }, (r) => { const s = pickSeen(r); queueMicrotask(() => bump('switch')); return s; }));
    const r = await p;
    expect(r).toMatchObject({ kind: 'pending', code: 'STALE_CONTEXT' });
    expect([rawWiped(), holds(r)]).toEqual([true, false]);
    expect(seen.length).toBe(1);
  });
  it('sweep: a switch, account change or sign-out at every microtask depth: nothing delivered holds a secret once the context died', async () => {
    let done = 0, other = 0;
    for (const kind of ['switch', 'account', 'signout'] as const) {
      for (let depth = 0; depth < 25; depth++) {
        boot({ realm: R1 });
      seenRaw.length = 0;
        const raw = answer();
        onFetch(() => ({ status: 201, body: raw }));
        const ctx = capture();
        let changed = false;
        const p = settled(mintSecret(mintRoute, { body: { name: 'a' }, ctx }, pickSeen));
        void (async () => {
          for (let i = 0; i < depth; i++) await Promise.resolve();
          changed = true;
          if (kind === 'switch') bump('switch'); else if (kind === 'account') endAccount('account'); else startLoggingOut();
        })();
        const r = await p;
        if (changed) expect([kind, depth, holds(r), r.ok?.held?.reveal(ctx) ?? null]).toEqual([kind, depth, false, null]);
        if (r.ok) done++; else other++;
        await settle(depth + 2);
        expect([kind, depth, changed, holds(seenRaw), r.ok?.held?.reveal(ctx) ?? null]).toEqual([kind, depth, true, false, null]);
      }
    }
    expect(done).toBeGreaterThan(0);
    expect(other).toBeGreaterThan(0);
  });
  it('a pick that throws: SCRUB_FAILED, pending for the change, no secret anywhere', async () => {
    boot({ realm: R1 });
    const raw = answer();
    onFetch(() => ({ status: 201, body: raw }));
    const r = await settled(mintSecret(mintRoute, { body: { name: 'a' } }, () => { throw new Error('bad'); }));
    expect(r).toMatchObject({ kind: 'pending' });
    expect(holds(r)).toBe(false);
  });
  it('a definite 4xx keeps only a declared code; the copy is gone', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { error: 'NAME_TAKEN', message: 'taken ' + SECRET } }));
    const r = await settled(mintSecret(mintRoute, { body: { name: 'a' } }, pick));
    expect(r).toMatchObject({ status: 409, code: 'NAME_TAKEN' });
    expect(holds(r)).toBe(false);
  });
});

describe('HeldSecret', () => {
  async function minted(): Promise<{ held: HeldSecret; ctx: ReturnType<typeof capture> }> {
    boot({ realm: R1 });
    onFetch(() => ({ status: 201, body: answer() }));
    const ctx = capture();
    const m = await mintSecret(mintRoute, { body: { name: 'a' }, ctx }, pick);
    return { held: m.held!, ctx };
  }
  for (const [ev, run] of [
    ['a realm switch', () => switchTo(R2)],
    ['a generation move', () => { bump('late'); }],
    ['a change of view', () => { setView('bots'); }],
    ['sign-out (account ended)', () => { endAccount('logout'); }],
    ['another tab signed in', () => { signIn(OTHER, 'sid-b'); bump('noop'); }],
    ['close', null],
  ] as const) {
    it(`goes on ${ev}, and its wipe unsubscribes`, async () => {
      const { held, ctx } = await minted();
      let dropped = 0;
      held.onDrop(() => dropped++);
      expect(held.reveal(ctx)).toBe(SECRET);
      if (run) await run(); else held.drop();
      expect(held.dropped).toBe(true);
      expect(held.reveal(ctx)).toBeNull();
      held.drop();
      expect(dropped).toBe(1);
    });
  }
  for (const how of ['same', 'realm', 'account'] as const) {
    it(`a fresh context (${how}) gets nothing and drops it`, async () => {
      const { held, ctx } = await minted();
      if (how === 'realm') await switchTo(R2);
      if (how === 'account') { signIn(OTHER, 'sid-b'); boot({ realm: R1 }); }
      const fresh = capture();
      expect(held.reveal(fresh)).toBeNull();
      expect(held.dropped).toBe(true);
      expect(held.reveal(ctx)).toBeNull();
    });
  }
  it('holdSecret refuses an empty value or a dead context', () => {
    boot({ realm: R1 });
    const ctx = capture();
    expect(holdSecret('', ctx)).toBeNull();
    expect(holdSecret(7, ctx)).toBeNull();
    bump('switch');
    expect(holdSecret(SECRET, ctx)).toBeNull();
  });
  it('useSecret shows it for the minting context and re-renders to nothing when it goes', async () => {
    const { held, ctx } = await minted();
    function Field() { return <span data-testid="v">{useSecret(held, ctx) ?? 'gone'}</span>; }
    const r = render(<Field />);
    expect(r.getByTestId('v').textContent).toBe(SECRET);
    act(() => { bump('switch'); });
    expect(r.getByTestId('v').textContent).toBe('gone');
    r.unmount();
  });
  it('useSecret under another context shows nothing', async () => {
    const { held } = await minted();
    function Field() { return <span data-testid="v">{useSecret(held, capture()) ?? 'gone'}</span>; }
    const r = render(<Field />);
    expect(r.getByTestId('v').textContent).toBe('gone');
    expect(held.dropped).toBe(true);
    r.unmount();
  });
});

