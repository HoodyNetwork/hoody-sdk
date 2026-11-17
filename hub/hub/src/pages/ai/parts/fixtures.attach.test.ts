// The fixture agent's attachment-lease answers match the agent's, and the tab's
// fixture states keep every registration they had (Instructions included) beside the new attachment answers.
import { agent, type FixtureRequest, type FixtureRule } from '@core';
import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures';
import { instructionsRoutes } from '../knowledge/instructions/routes';
import { attachRules } from './fixtures.attach';

/** The agent's numbers, written out here so the fixture cannot set its own expectation. */
const MIN = 60_000;

const req = (route: FixtureRule['route'], path: string, body: unknown): FixtureRequest => ({ route, method: route.method, path, query: {}, body, target: null, n: 1 });
const ask = async (rules: FixtureRule[], route: FixtureRule['route'], path: string, body: unknown = {}) => {
  const rule = rules.find((r) => r.route === route)!;
  const a = typeof rule.answer === 'function' ? await (rule.answer as (r: FixtureRequest) => unknown)(req(route, path, body)) : rule.answer;
  return a as { status?: number; body?: Record<string, unknown> };
};

describe('attachment lease fixtures', () => {
  const R = agent.attachRoutes;
  it('acquire: 201 {lease_id, expires_at} for a session the agent has, 404 not_found otherwise', async () => {
    let now = 1_000_000;
    const rules = attachRules(() => new Set(['s1']), () => now);
    const a = await ask(rules, R.acquire, '/sessions/s1/attachments');
    expect(a.status).toBe(201);
    expect(typeof a.body!.lease_id).toBe('string');
    expect(Date.parse(String(a.body!.expires_at))).toBe(now + 15 * MIN);
    expect(await ask(rules, R.acquire, '/sessions/nope/attachments')).toMatchObject({ status: 404, body: { error: 'not_found' } });
    now += 1;
  });

  it('renew: only a lease this session holds; 410 attachment_expired once it expired; 404 for one never issued', async () => {
    let now = 1_000_000;
    const rules = attachRules(() => new Set(['s1', 's2']), () => now);
    const id = String((await ask(rules, R.acquire, '/sessions/s1/attachments')).body!.lease_id);
    const r1 = await ask(rules, R.renew, `/sessions/s1/attachments/${id}`);
    expect(r1.status ?? 200).toBe(200);
    expect(r1.body).toMatchObject({ lease_id: id });
    expect(await ask(rules, R.renew, '/sessions/s1/attachments/never')).toMatchObject({ status: 404 });
    expect(await ask(rules, R.renew, `/sessions/s2/attachments/${id}`)).toMatchObject({ status: 404 });
    now += 15 * MIN;
    expect((await ask(rules, R.renew, `/sessions/s1/attachments/${id}`)).status ?? 200).toBe(200);
    now += 15 * MIN + 1;
    expect(await ask(rules, R.renew, `/sessions/s1/attachments/${id}`)).toMatchObject({ status: 410, body: { error: 'attachment_expired' } });
  });

  it('lifetimes follow attachmentTTL: absent or not positive -> 15 min, a positive ttl_ms as asked, capped at 60 min', async () => {
    const now = 1_000_000;
    const rules = attachRules(() => new Set(['s1']), () => now);
    const exp = async (body: unknown) => Date.parse(String((await ask(rules, R.acquire, '/sessions/s1/attachments', body)).body!.expires_at)) - now;
    expect(await exp({})).toBe(15 * MIN);
    expect(await exp({ ttl_ms: 0 })).toBe(15 * MIN);
    expect(await exp({ ttl_ms: -5 })).toBe(15 * MIN);
    expect(await exp({ ttl_ms: 'x' })).toBe(15 * MIN);
    expect(await exp({ ttl_ms: MIN })).toBe(MIN);
    expect(await exp({ ttl_ms: 120 * MIN })).toBe(60 * MIN);
    const id = String((await ask(rules, R.acquire, '/sessions/s1/attachments')).body!.lease_id);
    const r = await ask(rules, R.renew, `/sessions/s1/attachments/${id}`, { ttl_ms: 2 * MIN });
    expect(Date.parse(String(r.body!.expires_at)) - now).toBe(2 * MIN);
  });

  it('an expired lease is kept, never revived: renew answers 410 again, and release still answers 200 once', async () => {
    let now = 1_000_000;
    const rules = attachRules(() => new Set(['s1']), () => now);
    const id = String((await ask(rules, R.acquire, '/sessions/s1/attachments')).body!.lease_id);
    now += 15 * MIN + 1;
    expect(await ask(rules, R.renew, `/sessions/s1/attachments/${id}`)).toMatchObject({ status: 410 });
    expect(await ask(rules, R.renew, `/sessions/s1/attachments/${id}`)).toMatchObject({ status: 410 });
    const d = await ask(rules, R.release, `/sessions/s1/attachments/${id}`);
    expect(d.status ?? 200).toBe(200);
    expect(d.body).toEqual({ status: 'ok', released: true });
    expect(await ask(rules, R.renew, `/sessions/s1/attachments/${id}`)).toMatchObject({ status: 404 });
  });

  it('release: {status: "ok", released: true} once, then 404; a released lease cannot be renewed', async () => {
    const rules = attachRules(() => new Set(['s1']));
    const id = String((await ask(rules, R.acquire, '/sessions/s1/attachments')).body!.lease_id);
    const d = await ask(rules, R.release, `/sessions/s1/attachments/${id}`);
    expect(d.status ?? 200).toBe(200);
    expect(d.body).toEqual({ status: 'ok', released: true });
    expect(await ask(rules, R.release, `/sessions/s1/attachments/${id}`)).toMatchObject({ status: 404 });
    expect(await ask(rules, R.renew, `/sessions/s1/attachments/${id}`)).toMatchObject({ status: 404 });
  });
});

describe('the tab fixture states keep their registrations', () => {
  const routesOf = (state: string) => ((fixtures.states as Record<string, { rules?: readonly FixtureRule[] }>)[state]!.rules ?? []).map((r) => r.route);
  it('the default state answers Instructions and the attachment routes', () => {
    const routes = routesOf('default');
    expect(routes).toContain(instructionsRoutes.get);
    expect(routes).toContain(instructionsRoutes.put);
    for (const r of [agent.attachRoutes.acquire, agent.attachRoutes.renew, agent.attachRoutes.release]) expect(routes).toContain(r);
  });
  it('the Instructions conflict and lost-answer states are still there', () => {
    expect(Object.keys(fixtures.states)).toEqual(expect.arrayContaining(['instructionsConflict', 'instructionsLost']));
    expect(routesOf('instructionsLost')).toContain(instructionsRoutes.put);
  });
});
