// useSessionAgents on real core (fixture transport): the agents list of the chat's own computer and realm. An error and a malformed
// list are null (the tab says it could not read them), never a shorter list; a chat of another realm or computer never shows another's
// agents, not even while its own read runs.
import { answers, bootFixtureCore, CoreQueryProvider, fixtureWorld, FIXTURE_TARGET, queryClient, reply, type FixtureRequest, type Target } from '@core';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { routes } from '../routes';
import { useSessionAgents } from './sessionAgents';

const A: Target = FIXTURE_TARGET;
const B: Target = { project: A.project, container: { id: fixtureWorld.computers[1]!.id, server_name: fixtureWorld.computers[1]!.server_name } };
const R1 = fixtureWorld.realms[0]!.id;
const R2 = fixtureWorld.realms[1]!.id;
let asked: FixtureRequest[] = [];
type Answer = ReturnType<typeof answers.ok> | ReturnType<typeof answers.refused>;
const boot = (respond: (r: FixtureRequest) => Answer) => {
  asked = [];
  queryClient.clear();
  bootFixtureCore({ rules: [reply(routes.agents, (r) => { asked.push(r); return respond(r); })] });
};
const list = (...names: string[]) => answers.ok({ items: names.map((name) => ({ name })) });
const mount = (target: Target, realm: string) => renderHook((p: { target: Target; realm: string }) => useSessionAgents(p.target, p.realm), { wrapper: CoreQueryProvider, initialProps: { target, realm } });

beforeEach(() => { asked = []; });

describe('useSessionAgents (real query)', () => {
  it('reads once on the chat\'s computer: absent while it runs, then the names without the product\'s own', async () => {
    boot(() => answers.ok({ items: [{ name: 'general' }, { name: 'bot', provenance: 'product-owned (read-only)' }] }));
    const h = mount(A, R1);
    expect(h.result.current.names).toBeUndefined();
    await waitFor(() => expect(h.result.current.names).toEqual(['general']));
    expect(asked).toHaveLength(1);
    expect(asked[0]!.target).toEqual(A);
  });

  it('a refused read is null (the tab says it could not read them), never an empty list', async () => {
    boot(() => answers.refused(500, 'internal_error'));
    const h = mount(A, R1);
    await waitFor(() => expect(h.result.current.names).toBeNull());
  });

  it('a malformed list (a bad row, a missing items) is null, never a shorter list', async () => {
    boot(() => answers.ok({ items: [{ name: 'general' }, { name: 'Bad Name' }] }));
    const h = mount(A, R1);
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    await waitFor(() => expect(h.result.current.names).toBeNull());
    boot(() => answers.ok({ nope: true }));
    const g = mount(A, R2);
    await waitFor(() => expect(g.result.current.names).toBeNull());
  });

  it('another realm of the same computer reads its own list: never the first realm\'s, not even while it runs; back again, the first\'s own', async () => {
    // The reads in order: the first realm, the second realm, then the first realm again (its cached list shows at once, then it is read afresh).
    boot((r) => list(['general', 'reviewer', 'general'][r.n - 1] ?? 'general'));
    const h = mount(A, R1);
    await waitFor(() => expect(h.result.current.names).toEqual(['general']));
    h.rerender({ target: A, realm: R2 });
    expect(h.result.current.names).toBeUndefined();
    await waitFor(() => expect(h.result.current.names).toEqual(['reviewer']));
    h.rerender({ target: A, realm: R1 });
    expect(h.result.current.names).toEqual(['general']);
    await waitFor(() => expect(asked).toHaveLength(3));
    expect(h.result.current.names).toEqual(['general']);
  });

  it('another computer reads its own list: never the first computer\'s', async () => {
    boot((r) => (r.target?.container.id === A.container.id ? list('general') : list('reviewer')));
    const h = mount(A, R1);
    await waitFor(() => expect(h.result.current.names).toEqual(['general']));
    h.rerender({ target: B, realm: R1 });
    expect(h.result.current.names).toBeUndefined();
    await waitFor(() => expect(h.result.current.names).toEqual(['reviewer']));
    expect(asked.map((r) => r.target?.container.id)).toEqual([A.container.id, B.container.id]);
  });
});
