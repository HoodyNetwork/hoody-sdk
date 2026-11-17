// world.test.ts: fixtureWorld is one coherent sample world.
import { describe, expect, it } from 'vitest';
import { FIXTURE_REALM, FIXTURE_TARGET, FIXTURE_UID } from './transport';
import { fixtureWorld as W, manyComputers, manyNames } from './world';

const HEX24 = /^[0-9a-f]{24}$/;

describe('fixtureWorld', () => {
  it('is Ada with Personal and Acme client, atlas current; the fixture session uses it', () => {
    expect(W.account.name).toBe('Ada');
    expect(W.realms.map((r) => r.name).slice(0, 2)).toEqual(['Personal', 'Acme client']);
    expect(W.current.name).toBe('atlas');
    expect(FIXTURE_UID).toBe(W.account.id);
    expect(FIXTURE_REALM).toBe(W.realm('Personal').id);
    expect(FIXTURE_TARGET).toMatchObject({ container: { id: W.current.id } });
  });
  it('every id is well formed and unique; every name unique in its kind', () => {
    const ids = [W.account.id, ...W.realms.map((r) => r.id), ...W.projects.map((p) => p.id), ...W.servers.map((s) => s.id), ...W.computers.map((c) => c.id)];
    for (const id of ids) expect(id).toMatch(HEX24);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kind of [W.realms, W.projects, W.servers, W.computers, W.bots, W.schedules, W.scripts, W.keys]) {
      const names = (kind as readonly { name?: string; alias?: string }[]).map((x) => x.name ?? x.alias);
      expect(new Set(names).size).toBe(names.length);
    }
  });
  it('references resolve: computers to servers, projects and realms; programs, Bots, schedules and scripts to computers', () => {
    const realms = new Set(W.realms.map((r) => r.id)), comps = new Set(W.computers.map((c) => c.name));
    for (const c of W.computers) {
      expect(W.servers.some((s) => s.name === c.server_name && s.id === c.server_id)).toBe(true);
      expect(W.projects.some((p) => p.id === c.project_id)).toBe(true);
      for (const r of c.realm_ids) expect(realms.has(r)).toBe(true);
    }
    for (const x of [...W.programs, ...W.bots, ...W.schedules, ...W.scripts]) expect(comps.has(x.computer)).toBe(true);
    for (const b of W.bots) expect(b.model).toBe('hoody-ai/hoody-free');
    expect(W.billing.subscriptions.some((s) => s.state === 'overdue')).toBe(true);
  });
  it('keys are masked hints only; no internal name anywhere', () => {
    for (const k of W.keys) expect(k.hint.length).toBeLessThanOrEqual(12);
    const text = JSON.stringify(W);
    expect(text).not.toMatch(/X-Hoody-Bot|anthropic|claude/i);
  });
  it('names lists every display name once', () => {
    expect(W.names).toEqual(expect.arrayContaining(['Ada', 'Personal', 'Acme client', 'atlas', 'n12', 'Singapore']));
    expect(new Set(W.names).size).toBe(W.names.length);
  });
  it('is frozen', () => {
    expect(Object.isFrozen(W)).toBe(true);
    expect(Object.isFrozen(W.computers[0])).toBe(true);
  });
});

describe('many rows', () => {
  it('manyNames: unique, never numbered, stable per seed', () => {
    const a = manyNames(300, 7);
    expect(a).toHaveLength(300);
    expect(new Set(a).size).toBe(300);
    for (const n of a) expect(n).toMatch(/^[a-z]+(-[a-z]+){1,2}$/);
    expect(manyNames(300, 7)).toEqual(a);
    expect(manyNames(20, 8)).not.toEqual(a.slice(0, 20));
  });
  it('manyComputers: unique ids, on the world servers, projects and realms', () => {
    const cs = manyComputers(200, 3);
    expect(new Set(cs.map((c) => c.id)).size).toBe(200);
    for (const c of cs) {
      expect(c.id).toMatch(HEX24);
      expect(W.servers.some((s) => s.name === c.server_name)).toBe(true);
      expect(W.projects.some((p) => p.id === c.project_id)).toBe(true);
    }
    expect(cs.some((c) => W.computers.some((w) => w.id === c.id))).toBe(false);
  });
});
