// The Board's own preference object (data.ts pref, closed.ts hpref) is made again for each preference session. Kept
// from a disposed live session, it read that session's store and the next session's Board stayed "Loading…" (the
// full term suite: BoardView after live-pages). Here: a live mount of the Board ends, then the fixture Board renders.
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import { renderPage } from '../../../../scripts/term/render';
import { currentTermSession } from '../../../term/env/session';
import { mountTerminalHub } from '../../../term/entry';
import type { ClientCallControls, HoodyClient, Receipt } from '../../../term/host-types';
import { hoodyAttempt } from '../../../../scripts/term/live-fake-api';
import { UNSTYLED_FOR_TESTS } from '../../../term/app/styles';

setDefaultTimeout(120_000);
let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; currentTermSession()?.end(); });

function fakeClient(): { client: HoodyClient; end: () => void } {
  const listeners = new Set<(e: { sid: string; reason: 'expired' | 'signed-out' | 'revoked' }) => void>();
  const answers: Record<string, unknown> = {
    'GET /users/auth/me': { data: { id: '64f0ada00000000000000001', username: 'ada', email: 'ada@example.com' } },
    'GET /realms': { data: { realm_ids: [] } },
  };
  const client: HoodyClient = {
    identity: { kind: 'account', uid: '64f0ada00000000000000001', sid: 'sid-1' },
    apiOrigin: 'https://api.example.invalid',
    realmApiDomain: 'realm.invalid',
    request: async (method: string, p: string, b: unknown, o: ClientCallControls) => {
      if (!o.beforeWire(hoodyAttempt(method, p, b, (o as { base?: string }).base))) throw { status: 0, notSent: true };
      const a = answers[`${method} ${p.split('?')[0]}`];
      if (a === undefined) throw { status: 404, code: 'NOT_FOUND' };
      return structuredClone(a);
    },
    fetch: async () => { throw { status: 0, notSent: true }; },
    onAuthEnded: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };
  return { client, end: () => { for (const l of [...listeners]) l({ sid: 'sid-1', reason: 'signed-out' }); } };
}

test('after a live Board session ends, the next session\'s Board shows its Boards (not stuck "Loading…")', async () => {
  const f = fakeClient();
  let out = '';
  const done: Promise<Receipt> = mountTerminalHub({
    styles: UNSTYLED_FOR_TESTS, client: f.client, route: { page: 'board', path: '/board' }, onSetDefault: async () => {},
    context: { profile: 'test', realmId: 'all', projectId: '6a0000000000000000000001', containerId: 'c0a7150000000000000000a1' },
    io: { cells: { write: (s) => { out += s; } }, input: { onData: () => () => {} }, size: () => ({ cols: 100, rows: 30 }), colourTier: 'mono' },
  });
  for (let i = 0; i < 400 && !out.includes('HOODY'); i++) await new Promise((r) => setTimeout(r, 25));
  await new Promise((r) => setTimeout(r, 600));
  f.end();
  await done;

  const s = await renderPage({ page: 'board', cols: 80, rows: 24 });
  close = () => s.close();
  expect(s.failures).toEqual([]);
  expect(s.frame).toContain('The Board shows live programs');
});
