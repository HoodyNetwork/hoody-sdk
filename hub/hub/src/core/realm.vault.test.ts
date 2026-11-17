// The vault key routes widened for the Vault page: realm_id query, metadata body, secret answers,
// fixed codes; realm.ts's own alias read and rename keep working through them.
import { describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { vaultKeyPutRoute, vaultKeyRoute } from './index';
import { setAlias } from './realm';
import { installTransport, reply, startFixtureMode } from './transport';
import { resetCore } from './ctx';
import { boot, calls, onFetch, R1, R2 } from './test/env';

const VAULT = '/api/v1/vault/keys/hoody.realm-aliases';

describe('vault routes: declarations', () => {
  it('both are secret base routes taking realm_id; the PUT takes value and metadata; fixed codes only', () => {
    expect(vaultKeyRoute).toMatchObject({ method: 'GET', scope: 'base', secret: true, query: ['realm_id'], codes: ['INSUFFICIENT_PERMISSIONS'] });
    expect(vaultKeyPutRoute).toMatchObject({ method: 'PUT', scope: 'base', secret: true, query: ['realm_id'], body: ['value', 'metadata'], etagMatch: true, codes: ['VAULT_LIMIT_EXCEEDED', 'INSUFFICIENT_PERMISSIONS', 'PRECONDITION_FAILED'] });
  });
});

describe('vault routes: the aliases still work through them', () => {
  it('rename reads the map (the scrub copies it out before nulling the answer\'s copy) and writes Global, no metadata', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET'
      ? { status: 200, body: { data: { key: 'hoody.realm-aliases', value: JSON.stringify({ [R2]: 'Two' }), metadata: { m: 1 } } }, headers: { etag: '"aliases-v1"' } }
      : { status: 200, body: { data: { key: 'hoody.realm-aliases', value: c.body.value } } }));
    // Not {} : a scrub that nulled the value before it was read would wipe R2's alias here.
    expect(await setAlias(R1, 'One')).toEqual({ [R2]: 'Two', [R1]: 'One' });
    expect(calls.map((c) => [c.method, c.url.replace(/^https:\/\/[^/]+/, '')])).toEqual([['GET', VAULT], ['PUT', VAULT]]);
    expect(Object.keys(calls[1]!.body)).toEqual(['value']);
    expect(calls.some((c) => c.url.includes('realm_id'))).toBe(false);
  });
  it('no map yet (404) is still empty: the secret rejection keeps its status', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.method === 'GET' ? { status: 404, body: { error: 'Not Found', echo: 'x' } } : { status: 200, body: {} }));
    expect(await setAlias(R1, 'One')).toEqual({ [R1]: 'One' });
  });
  it('fixture mode: the alias blob is read again intact (the scrub nulls only the copy it is given)', async () => {
    resetCore();
    const blob = JSON.stringify({ [R2]: 'Two' });
    startFixtureMode([reply(vaultKeyRoute, { body: { data: { value: blob } }, headers: { etag: '"aliases-v1"' } }), reply(vaultKeyPutRoute, { body: {} })], { realm: R1 });
    expect(await setAlias(R1, 'One')).toEqual({ [R2]: 'Two', [R1]: 'One' });
    expect(await setAlias(R1, 'Uno')).toEqual({ [R2]: 'Two', [R1]: 'Uno' });
    installTransport(null);
  });
});

describe('vault routes: the Vault page\'s calls', () => {
  it('a PUT with realm_id and metadata passes the route checks and goes out as given', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { data: { key: 'k1', value: 's3cret-value' } } }));
    let seen: unknown = 'unset';
    const r = await api(vaultKeyPutRoute, { params: { key: 'k1' }, query: { realm_id: R2 }, body: { value: 's3cret-value', metadata: { note: 'a' } }, scrub: (x) => { seen = (x as { data: { value: unknown } }).data.value; (x as { data: { value: unknown } }).data.value = null; } });
    expect(seen).toBe('s3cret-value');
    expect(r).toEqual({ data: { key: 'k1', value: null } });
    expect(calls[0]!.url).toMatch(new RegExp('/api/v1/vault/keys/k1\\?realm_id=' + R2 + '$'));
    expect(calls[0]!.body).toEqual({ value: 's3cret-value', metadata: { note: 'a' } });
  });
  it('another body key or query key is refused unsent', async () => {
    boot({ realm: R1 });
    await expect(api(vaultKeyPutRoute, { params: { key: 'k1' }, body: { value: 'v', extra: 1 } as never })).rejects.toMatchObject({ notSent: true, code: 'ROUTE_BODY' });
    await expect(api(vaultKeyRoute, { params: { key: 'k1' }, query: { realm: R2 } as never })).rejects.toMatchObject({ notSent: true, code: 'ROUTE_QUERY' });
    expect(calls).toHaveLength(0);
  });
  it('a refusal keeps status and the fixed code only: an echoed value never reaches the caller', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 400, body: { error: 'VAULT_LIMIT_EXCEEDED', message: 'value s3cret-value too big', data: { value: 's3cret-value' } } }));
    const e = (await api(vaultKeyPutRoute, { params: { key: 'k1' }, body: { value: 's3cret-value' } }).then(() => null, (x: unknown) => x)) as HubError;
    expect(e).toMatchObject({ status: 400, code: 'VAULT_LIMIT_EXCEEDED' });
    expect(JSON.stringify(e)).not.toContain('s3cret');
    onFetch(() => ({ status: 403, body: { error: 'INSUFFICIENT_PERMISSIONS', value: 's3cret-value' } }));
    const f = (await api(vaultKeyRoute, { params: { key: 'k1' } }).then(() => null, (x: unknown) => x)) as HubError;
    expect(f).toMatchObject({ status: 403, code: 'INSUFFICIENT_PERMISSIONS' });
    expect(JSON.stringify(f)).not.toContain('s3cret');
  });
});
