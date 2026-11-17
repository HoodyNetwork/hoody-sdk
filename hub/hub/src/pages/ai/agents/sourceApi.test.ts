// The editor's requests through the real core over a fake fetch: the wire shapes, the compare-and-swap token in
// the body, the settled outcomes (a lost answer is pending, a stale write is a refusal that wrote nothing).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@core';
import { AGENT, boot, calls, onFetch, R1 } from '@core/test/env';
import { agentSourceApi, sourceRoutes } from './sourceApi';

const at = (c: (typeof calls)[number]) => new URL(c.url);

beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); });
afterEach(() => { queryClient.clear(); });

describe('getAgentSource', () => {
  it('GET /agents/{name}/source in the realm, with no cwd and no config dir', async () => {
    onFetch(() => ({ status: 200, body: { path: '/h/agents/helper.md', content: 'x', revision: 'r1' } }));
    const r = await agentSourceApi('helper', { realm: R1 }).get();
    expect(r).toEqual({ ok: true, body: { path: '/h/agents/helper.md', content: 'x', revision: 'r1' } });
    expect(calls.length).toBe(1);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url.startsWith(`${AGENT}/agents/helper/source`)).toBe(true);
    expect(at(calls[0]!).searchParams.get('realm')).toBe(R1);
    expect(Object.keys(calls[0]!.headers).filter((h) => /^x-hoody-(cwd|config-dir)/.test(h))).toEqual([]);
  });
  it('a name is one path part: a slash, ".." or nothing is refused unsent, a space is encoded', async () => {
    onFetch(() => ({ status: 404, body: { code: 'not_found' } }));
    for (const bad of ['a/b', '../x', '']) expect(await agentSourceApi(bad).get()).toMatchObject({ ok: false, err: { kind: 'not_sent', code: 'route_params' } });
    expect(calls.length).toBe(0);
    await agentSourceApi('a b').get();
    expect(at(calls[0]!).pathname).toBe('/api/v1/agent/agents/a%20b/source');
  });
  it('a 404 is a failed read with its code', async () => {
    onFetch(() => ({ status: 404, body: { code: 'not_found', message: 'gone' } }));
    const r = await agentSourceApi('helper').get();
    expect(r).toMatchObject({ ok: false, err: { kind: 'failed', status: 404, code: 'not_found' } });
  });
});

describe('putAgentSource', () => {
  it('PUT {content, expected_revision}: the text is sent byte for byte, with the revision', async () => {
    onFetch(() => ({ status: 200, body: { path: '/h/agents/helper.md', revision: 'r2' } }));
    const text = '---\ntools: none\n---\n  keep   this  \n';
    const r = await agentSourceApi('helper', { realm: R1 }).put(text, 'r1');
    expect(r).toEqual({ ok: true, body: { path: '/h/agents/helper.md', revision: 'r2' } });
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.body).toEqual({ content: text, expected_revision: 'r1' });
  });
  it('core never sends a save without its revision', async () => {
    const r = await agentSourceApi('helper').put('x', '');
    expect(calls.length).toBe(0);
    expect(r).toMatchObject({ ok: false, err: { kind: 'not_sent' } });
  });
  it('409 revision_conflict: a refusal that wrote nothing, with the current revision', async () => {
    onFetch(() => ({ status: 409, body: { code: 'revision_conflict', message: 'moved', details: { current_revision: 'r6' } } }));
    const r = await agentSourceApi('helper').put('x', 'r5');
    expect(r).toEqual({ ok: false, err: { kind: 'failed', code: 'revision_conflict', status: 409, retryAfterMs: null, notApplied: true, currentRevision: 'r6' } });
  });
  it('a lost answer is pending, never failed', async () => {
    onFetch(() => ({ status: 200, network: true }));
    const r = await agentSourceApi('helper').put('x', 'r5');
    expect(r).toMatchObject({ ok: false, err: { kind: 'pending' } });
  });
  it('a 400 is a failed, definite refusal with its code', async () => {
    onFetch(() => ({ status: 400, body: { code: 'bad_request', message: 'invalid frontmatter' } }));
    const r = await agentSourceApi('helper').put('x', 'r5');
    expect(r).toMatchObject({ ok: false, err: { kind: 'failed', status: 400, code: 'bad_request', notApplied: false } });
  });
});

describe('deleteAgent and resetAgentToShipped (gated tool envelopes)', () => {
  const del = (n = 'helper') => agentSourceApi(n, { realm: R1 }).remove();
  const reset = (n = 'helper') => agentSourceApi(n, { realm: R1 }).reset();
  it('wire: DELETE /agents/{name}; POST /agents/{name}/reset-to-shipped, no body, realm only', async () => {
    onFetch(() => ({ status: 200, body: { output: 'deleted', is_error: false } }));
    expect(await del()).toMatchObject({ ok: true });
    expect(await reset()).toMatchObject({ ok: true });
    expect(calls.map((c) => `${c.method} ${at(c).pathname}`)).toEqual(['DELETE /api/v1/agent/agents/helper', 'POST /api/v1/agent/agents/helper/reset-to-shipped']);
    expect(calls.every((c) => c.body === null && at(c).searchParams.get('realm') === R1)).toBe(true);
  });
  it('daemon_paused (the 503 answer, or the older envelope) is a refusal made before anything applied', async () => {
    onFetch(() => ({ status: 503, body: { code: 'daemon_paused', message: 'paused' }, headers: { 'retry-after': '3' } }));
    expect(await del()).toMatchObject({ ok: false, err: { kind: 'failed', code: 'daemon_paused', notApplied: true, retryAfterMs: 3000 } });
    onFetch(() => ({ status: 200, body: { is_error: true, code: 'daemon_paused', output: 'paused' } }));
    expect(await reset()).toMatchObject({ ok: false, err: { kind: 'failed', code: 'daemon_paused', notApplied: true } });
  });
  it('any other tool error may have run in part: unknown (pending), read back before saying either way', async () => {
    onFetch(() => ({ status: 200, body: { is_error: true, output: 'cannot delete a shipped agent' } }));
    expect(await del('general')).toMatchObject({ ok: false, err: { kind: 'pending', notApplied: false } });
  });
  it('a lost answer is pending', async () => {
    onFetch(() => ({ status: 200, network: true }));
    expect(await del()).toMatchObject({ ok: false, err: { kind: 'pending' } });
  });
});

describe('what a refusal can show', () => {
  it('a code core and the route do not know is dropped; the known ones are kept (lower-cased)', async () => {
    onFetch(() => ({ status: 400, body: { code: 'private_diagnostic_home_secret', message: 'x' } }));
    expect(await agentSourceApi('helper').put('x', 'r1')).toMatchObject({ ok: false, err: { code: '', status: 400 } });
    onFetch(() => ({ status: 400, body: { error: 'private server diagnostic /home/private' } }));
    expect(await agentSourceApi('helper').put('x', 'r1')).toMatchObject({ ok: false, err: { code: '', status: 400 } });
    onFetch(() => ({ status: 400, body: { code: 'bad_request' } }));
    expect(await agentSourceApi('helper').put('x', 'r1')).toMatchObject({ ok: false, err: { code: 'bad_request' } });
  });
});

describe('routes', () => {
  it('the four are declared once, on the agent', () => {
    expect(Object.values(sourceRoutes).map((r) => `${r.method} ${r.path} ${r.scope}`)).toEqual([
      'GET /agents/:name/source agent', 'PUT /agents/:name/source agent', 'DELETE /agents/:name agent', 'POST /agents/:name/reset-to-shipped agent',
    ]);
  });
});
