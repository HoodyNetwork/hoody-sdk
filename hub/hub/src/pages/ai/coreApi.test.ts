// The real Api over core's fixture transport: reads answer, a refused key keeps its code through core's
// secret rebuild, a gateway error on a change is pending (never retried), and the typed key is wiped.
import { answers, bootFixtureCore, reply } from '@core';
import { describe, expect, it } from 'vitest';
import { coreApi } from './coreApi';
import { routes } from './routes';

describe('coreApi', () => {
  it('reads a provider list through its declared route', async () => {
    bootFixtureCore({ rules: [reply(routes.providers, answers.ok({ providers: [{ id: 'hoody-ai' }] }))] });
    const r = await coreApi().providers();
    expect(r).toEqual({ ok: true, body: { providers: [{ id: 'hoody-ai' }] } });
  });

  it('names a refused key by its status and wipes the typed key', async () => {
    bootFixtureCore({ rules: [reply(routes.keyPut, answers.refused(422, 'api_key_refused'))] });
    const body = { api_key: 'sk-test-1', check: true as const };
    const r = await coreApi().keyPut('anthropic', body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.err).toMatchObject({ kind: 'failed', code: 'api_key_refused', status: 422 });
    expect(body.api_key).toBe('');
  });

  it('treats a gateway error on a change as pending, sent once', async () => {
    let n = 0;
    bootFixtureCore({ rules: [reply(routes.keyDelete, () => { n += 1; return answers.pending5xx(502); })] });
    const r = await coreApi().keyDelete('openai');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.err.kind).toBe('pending');
    expect(n).toBe(1);
  });
});

describe('the terminal wait', () => {
  it('sends a wait mode the terminal service accepts (stable, regex or either)', () => {
    const files = import.meta.glob('./coreApi.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const src = Object.values(files)[0] ?? '';
    const modes = [...src.matchAll(/termWait:[^\n]*mode: '([a-z]+)'/g)].map((m) => m[1]);
    expect(modes.length).toBe(1);
    expect(['stable', 'regex', 'either']).toContain(modes[0]);
  });
});
