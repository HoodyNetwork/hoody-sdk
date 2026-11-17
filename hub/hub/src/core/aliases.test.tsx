// aliases.test.tsx: the proxy alias routes are realm-scoped with one route per endpoint, an edit sends only the keys it
// changes, and Computers and Scripts share one lock per alias.
import { describe, expect, it } from 'vitest';
import { aliasLock, aliasRoutes, defineMutation } from './index';
import { build } from './routes';
import { reply, startFixtureMode } from './transport';
import { boot, R1 } from './test/env';

describe('proxy aliases', () => {
  it('every alias route is realm-scoped (the service scopes aliases to the realm host)', () => {
    for (const r of Object.values(aliasRoutes)) expect(r.scope).toBe('realm');
  });
  it('one route per alias endpoint, under one name each: edit is the only PATCH of an alias', () => {
    const ends = Object.values(aliasRoutes).map((r) => `${r.method} ${r.path}`);
    expect(new Set(ends).size).toBe(ends.length);
    expect(Object.keys(aliasRoutes).sort()).toEqual(['create', 'edit', 'list', 'remove', 'state']);
    expect(`${aliasRoutes.edit.method} ${aliasRoutes.edit.path}`).toBe('PATCH /proxy/aliases/:id');
  });
  it('an edit sends only the keys its caller changes (alias, port, expires_at); any other key is refused unsent', () => {
    for (const body of [{ alias: 'shop-two' }, { port: 8080 }, { alias: 'shop-two', port: 8080 }, { expires_at: '2026-11-13T17:00:00Z' }]) {
      const b = build(aliasRoutes.edit, { params: { id: 'a1' }, body });
      expect('refused' in b ? b.refused : b.body, JSON.stringify(body)).toEqual(body);
    }
    for (const body of [{ program: 'http' }, { index: 1 }, { alias: 'shop-two', enabled: false }]) {
      expect(build(aliasRoutes.edit, { params: { id: 'a1' }, body }), JSON.stringify(body)).toEqual({ refused: 'ROUTE_BODY' });
    }
  });
  it('a removal pending on one page refuses the other page\'s change of the same alias, unsent', async () => {
    boot({ realm: R1 });
    let sends = 0;
    startFixtureMode([reply(aliasRoutes.remove, () => { sends++; return { status: 502, body: {} }; }), reply(aliasRoutes.state, () => { sends++; return { body: {} }; })]);
    const computersRemove = defineMutation<{ alias: string }>(aliasRoutes.remove, { input: (v) => ({ params: { id: v.alias } }), lock: aliasLock.lock, lockKey: (v) => aliasLock.key(v.alias) });
    const scriptsState = defineMutation<{ id: string; enabled: boolean }>(aliasRoutes.state, { input: (v) => ({ params: { id: v.id }, body: { enabled: v.enabled } }), lock: aliasLock.lock, lockKey: (v) => aliasLock.key(v.id) });
    expect((await computersRemove.run({ alias: 'a1' })).outcome).toBe('pending');
    expect((await scriptsState.run({ id: 'a1', enabled: false })).error?.code).toBe('HELD_BY_OTHER'); // Computers' removal holds the lock
    expect((await scriptsState.run({ id: 'a2', enabled: false })).outcome).toBe('done');
    expect(sends).toBe(2);
  });
});
