// The instructions requests through the real core over a fake fetch: the wire shapes (realm named, text and on/off sent
// together with the revision in the body), the settled outcomes (a lost answer is pending; revision_conflict and
// instructions_overridden are refusals that wrote nothing, with their details).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@core';
import { AGENT, boot, calls, onFetch, R1, TARGET } from '@core/test/env';
import { instructionsApi } from './api';

const at = (c: (typeof calls)[number]) => new URL(c.url);
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
});
afterEach(() => { queryClient.clear(); });

const api = () => instructionsApi(TARGET, R1);

describe('getAgentInstructions', () => {
  it('GET /settings/agent-instructions in the realm, no body, no cwd', async () => {
    onFetch(() => ({ status: 200, body: { text: 'x', enabled: true, revision: 'r1' } }));
    expect(await api().get()).toEqual({ ok: true, body: { text: 'x', enabled: true, revision: 'r1' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url.startsWith(`${AGENT}/settings/agent-instructions`)).toBe(true);
    expect(at(calls[0]!).searchParams.get('realm')).toBe(R1);
    expect(calls[0]!.body).toBeNull();
    expect(Object.keys(calls[0]!.headers).filter((h) => /^x-hoody-(cwd|config-dir)/.test(h))).toEqual([]);
  });
  it('a bare 404 settles with no code (an agent without the route); 500 store_failed keeps its code', async () => {
    onFetch(() => ({ status: 404, text: '404 page not found\n', headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    expect(await api().get()).toMatchObject({ ok: false, err: { kind: 'failed', status: 404, code: '' } });
    onFetch(() => ({ status: 500, body: { code: 'store_failed', message: 'x' } }));
    expect(await api().get()).toMatchObject({ ok: false, err: { kind: 'failed', status: 500, code: 'store_failed' } });
  });
});

describe('putAgentInstructions', () => {
  it('PUT {text, enabled, expected_revision}: all three, the text byte for byte', async () => {
    onFetch(() => ({ status: 200, body: { text: ' a\n', enabled: false, revision: 'r2' } }));
    const r = await api().put({ text: ' a\n', enabled: false }, 'r1');
    expect(r).toEqual({ ok: true, body: { text: ' a\n', enabled: false, revision: 'r2' } });
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url.startsWith(`${AGENT}/settings/agent-instructions`)).toBe(true);
    expect(at(calls[0]!).searchParams.get('realm')).toBe(R1);
    expect(calls[0]!.body).toEqual({ text: ' a\n', enabled: false, expected_revision: 'r1' });
  });
  it('core never sends a save without its revision', async () => {
    const r = await api().put({ text: 'x', enabled: true }, '');
    expect(calls).toHaveLength(0);
    expect(r).toMatchObject({ ok: false, err: { kind: 'not_sent' } });
  });
  it('409 revision_conflict: wrote nothing, with the current revision', async () => {
    onFetch(() => ({ status: 409, body: { code: 'revision_conflict', message: 'moved', details: { current_revision: 'r6' } } }));
    expect(await api().put({ text: 'x', enabled: true }, 'r5')).toEqual({
      ok: false, err: { kind: 'failed', code: 'revision_conflict', status: 409, notApplied: true, currentRevision: 'r6', fields: null },
    });
  });
  it('409 instructions_overridden: wrote nothing, with the fields the local file sets', async () => {
    onFetch(() => ({ status: 409, body: { code: 'instructions_overridden', message: 'local', details: { fields: ['enabled'] } } }));
    expect(await api().put({ text: 'x', enabled: true }, 'r5')).toEqual({
      ok: false, err: { kind: 'failed', code: 'instructions_overridden', status: 409, notApplied: true, currentRevision: null, fields: ['enabled'] },
    });
  });
  it.each([
    [400, 'bad_request'],
    [403, 'forbidden'],
  ])('a %i (%s) to a save is a definite refusal that wrote nothing listed: failed, not pending', async (status, code) => {
    onFetch(() => ({ status, body: { code, message: 'no' } }));
    const r = await api().put({ text: 'x', enabled: true }, 'r5');
    expect(r).toMatchObject({ ok: false, err: { kind: 'failed', status, currentRevision: null, fields: null } });
  });
  it('503 restriction_unknown and 500 store_failed to a save may have gone through: pending (core: a 5xx to a change)', async () => {
    for (const [status, code] of [[503, 'restriction_unknown'], [500, 'store_failed']] as const) {
      onFetch(() => ({ status, body: { code, message: 'x' } }));
      expect(await api().put({ text: 'x', enabled: true }, 'r5')).toMatchObject({ ok: false, err: { kind: 'pending', status } });
    }
  });
  it('a lost answer is pending, never failed', async () => {
    onFetch(() => ({ status: 200, network: true }));
    expect(await api().put({ text: 'x', enabled: true }, 'r5')).toMatchObject({ ok: false, err: { kind: 'pending' } });
  });
});
