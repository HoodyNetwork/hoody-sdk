// Check again for a deleted endpoint reads the provider list: only a list read whole proves it gone. An answer with
// no list (no providers or items array) or with a row that has no id proves nothing: not confirmed, never removed.
import { describe, expect, it } from 'vitest';
import type { Api } from './api';
import { confirmGone } from './flows-disconnect';
import type { Account } from './logic';

const ENDPOINT: Account = { id: 'my-endpoint', prefix: 'my-endpoint', label: 'My endpoint', ready: false, pay: 'unknown', custom: true, via: null, status: null };
/** An Api whose provider list answers `body` (a 200); counts what else is called. */
function listing(body: unknown) {
  const sent: string[] = [];
  const api = new Proxy({} as Record<string, unknown>, {
    get: (_t, name) => () => {
      sent.push(String(name));
      return Promise.resolve(name === 'providers' ? { ok: true, body } : { ok: true, body: {} });
    },
  }) as unknown as Api;
  return { api, sent };
}

describe('confirmGone for an endpoint: absence needs a readable list', () => {
  it.each([
    ['no list at all', {}],
    ['a list that is not an array', { providers: { 'my-endpoint': {} } }],
    ['items that are not an array', { items: 'my-endpoint' }],
    ['a body that is not an object', 'oops'],
    ['a row with no id', { providers: [{ id: 'other' }, { display_name: 'My endpoint' }] }],
    ['a row that is not an object', { items: [null] }],
  ])('%s: not confirmed, and only a read', async (_name, body) => {
    const f = listing(body);
    expect(await confirmGone(f.api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'not_confirmed' });
    expect(f.sent).toEqual(['providers']);
  });

  it('a whole list without it is removed; one with it is present (control)', async () => {
    expect(await confirmGone(listing({ providers: [{ id: 'other' }] }).api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'removed' });
    expect(await confirmGone(listing({ items: [] }).api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'removed' });
    expect(await confirmGone(listing({ providers: [{ id: 'my-endpoint' }] }).api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'present' });
  });
});
