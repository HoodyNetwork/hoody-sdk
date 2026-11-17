// A bodyText route's text (it may hold a proxy credential) stays out of the mutation cache, the change store,
// the held-changes list, the console and the error once a change through it settles.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bump, resetCore } from './ctx';
import { heldOfBase } from './changes';
import { defineMutation, queryClient, varsDigest } from './query';
import { defineRoute } from './routes';
import { installTransport, reply, startFixtureMode, type FixtureRule } from './transport';

const upstream = defineRoute<unknown, { ok: boolean }>({ method: 'PUT', path: '/api/v1/egress/upstream', scope: 'kit', kit: 'egress', index: 1, bodyText: true });
// A text body is secret, so its change names a lockKey (needsLockKey): the stored lock is a digest of that, never of the text.
const setUpstream = defineMutation<string>(upstream, { input: (v) => ({ body: v }), lockKey: () => 'egress-upstream' });
const SECRET = 'socks5h://user:hunter2pass@10.0.0.2:1080';

function mode(rules: readonly FixtureRule[]) {
  resetCore();
  startFixtureMode(rules, { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  queryClient.clear();
}
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

beforeEach(() => { bump('test-boot'); });
afterEach(() => { cleanup(); installTransport(null); vi.restoreAllMocks(); });

/** Everything outside the hook's own answer that could keep the text. */
function leftovers(spies: ReturnType<typeof vi.spyOn>[]): string {
  const stored: string[] = [];
  for (let i = 0; i < localStorage.length; i++) stored.push(localStorage.getItem(localStorage.key(i)!) ?? '');
  for (let i = 0; i < sessionStorage.length; i++) stored.push(sessionStorage.getItem(sessionStorage.key(i)!) ?? '');
  return JSON.stringify({
    cache: queryClient.getMutationCache().getAll().map((x) => [x.state.variables, x.state.data, x.state.error]),
    stored,
    held: heldOfBase('q:' + upstream.id),
    logged: spies.map((s) => s.mock.calls),
  });
}

describe('bodyText: a change through it needs a lockKey', () => {
  it('a definition without one is refused when it is made', () => {
    expect(() => defineMutation<string>(upstream, { input: (v) => ({ body: v }) })).toThrow(/lockKey/);
  });
});

describe('bodyText: the text leaves nothing behind once the change settles', () => {
  for (const [name, answer, outcome] of [
    ['done', { body: { ok: true } }, 'done'],
    ['pending (502)', { status: 502, body: {} }, 'pending'],
    ['failed (400 echoing the text)', { status: 400, body: { error: 'bad_upstream', echo: SECRET } }, 'failed'],
  ] as const) {
    it(name, async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
      let sent: unknown;
      mode([reply(upstream, (req) => { sent = req.body; return answer; })]);
      const { result } = renderHook(() => setUpstream.use(), { wrapper: wrap });
      await act(async () => { await result.current.run(SECRET); });
      expect(sent).toBe(SECRET);
      expect(result.current.outcome).toBe(outcome);
      await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
      const left = leftovers(spies);
      expect(left).not.toContain('hunter2pass');
      // Nor its digest (an unsalted SHA-256 of a proxy URL can be guessed offline).
      const d = await varsDigest(SECRET);
      expect(left).not.toContain(d.replace(/^.*:/, ''));
      expect(JSON.stringify(result.current.error ?? null)).not.toContain('hunter2pass');
    });
  }
});
