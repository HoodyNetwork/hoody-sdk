// A new session forgets the keys an earlier one made or removed: every state's live list is built once when the
// fixtures load, so resetFixtureServer puts it back to the state's fixed rows and the next key minted is the first again.
import { describe, expect, it } from 'vitest';
import type { FixtureRequest, FixtureRule } from '@core';
import fixtures, { resetFixtureServer } from './fixtures';
import { routes } from './routes';

type Answer = { status?: number; body?: { data?: Array<{ id: string }> | { id: string } } };
const rule = (rs: readonly FixtureRule[], route: unknown): FixtureRule => {
  const r = rs.find((x) => x.route === route);
  if (!r) throw new Error('no rule');
  return r;
};
const call = async (r: FixtureRule, req: Partial<FixtureRequest>): Promise<Answer> =>
  (typeof r.answer === 'function' ? await r.answer({ method: 'GET', path: '/', query: {}, body: null, ...req } as FixtureRequest) : r.answer) as Answer;
const ids = async (rs: readonly FixtureRule[]): Promise<string[]> =>
  ((await call(rule(rs, routes.list), {})).body?.data as Array<{ id: string }>).map((k) => k.id);

describe('keys fixtures: resetFixtureServer resets every state\'s live list', () => {
  it('a created and a removed key are gone after a reset, and the next key minted is the first again', async () => {
    resetFixtureServer();
    const rs = fixtures.states.many;
    const before = await ids(rs);
    const first = (await call(rule(rs, routes.create), { method: 'POST', body: { alias: 'ci-deploy' } })).body?.data as { id: string };
    await call(rule(rs, routes.remove), { method: 'DELETE', path: `/api/v1/auth-tokens/${before[0]}` });
    const changed = await ids(rs);
    expect(changed).toContain(first.id);
    expect(changed).not.toContain(before[0]);

    resetFixtureServer();
    expect(await ids(rs)).toEqual(before);
    const again = (await call(rule(rs, routes.create), { method: 'POST', body: { alias: 'ci-deploy' } })).body?.data as { id: string };
    expect(again.id).toBe(first.id);
    resetFixtureServer();
  });
});
