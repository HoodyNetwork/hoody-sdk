// exportVault.ts over core's fixture transport: the file's shape (the agent TUI's import shape), Encrypted and Readable
// modes, the read loop's refusals, and what never leaks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answers, bootFixtureCore, fixtureSession, reply, type FixtureAnswer, type FixtureRule } from '@core';
import { decrypt } from './crypto';
import fixtures, { FIXTURE_PASSWORD, FIXTURE_PLAINTEXT, REALM_A, REALM_B, requestLog, resetFixtureVaults } from './fixtures';
import { sdkVectors } from './crypto.vectors';
import { exportFileName, exportText, runExport, type ExportOptions, type ExportProgress, type ExportRun } from './exportVault';
import { routes } from './routes';

const ENV = sdkVectors[0]!.envelope;
const PW = 'export-test-pw';

beforeEach(() => {
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const boot = (state: keyof typeof fixtures.states = 'default', extra: FixtureRule[] = []) => bootFixtureCore({ rules: [...extra, ...fixtures.states[state]] });
const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ mode: 'encrypted', password: PW, signal: new AbortController().signal, ...o });
const parsed = (r: ExportRun) => {
  if (!r.ok) throw new Error('not ok: ' + r.why);
  return JSON.parse(r.text) as Record<string, { value: string; metadata?: Record<string, unknown> }>;
};
/** A read rule for one key, answered before the state's own (first match wins). */
const readOf = (key: string, answer: () => FixtureAnswer): FixtureRule =>
  reply(routes.read, () => answer(), { when: (req) => req.path.endsWith(`/${encodeURIComponent(key)}`) });

describe('the file', () => {
  it('Readable: the TUI import shape, keys sorted, values as stored, metadata only when present', async () => {
    boot();
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '' }));
    expect(r).toMatchObject({ ok: true, count: 3, failed: [], gone: 0 });
    const f = parsed(r);
    expect(Object.keys(f)).toEqual(['db-password', 'deploy.notes', 'github-token']);
    expect(f['github-token']).toEqual({ value: 'fixture-token-value-000000000001' });
    expect(f['deploy.notes']).toEqual({ value: 'Deploy on Fridays only after the backup ran.', metadata: { owner: 'ops' } });
    expect(f['db-password']).toEqual({ value: ENV, metadata: { encrypted: true } });
    expect(r.ok && r.text).toBe(JSON.stringify(f, null, 2));
  });

  it('Encrypted: plain values become envelopes the existing decrypt opens; an envelope is copied byte for byte, never decrypted', async () => {
    boot();
    const dec = vi.spyOn(await import('./crypto'), 'decrypt');
    const r = await runExport(REALM_A, opts());
    const f = parsed(r);
    expect(dec).not.toHaveBeenCalled();
    expect(f['db-password']).toEqual({ value: ENV, metadata: { encrypted: true } });
    expect(await decrypt(f['db-password']!.value, FIXTURE_PASSWORD)).toBe(FIXTURE_PLAINTEXT);
    expect(await decrypt(f['github-token']!.value, PW)).toBe('fixture-token-value-000000000001');
    expect(await decrypt(f['deploy.notes']!.value, PW)).toBe('Deploy on Fridays only after the backup ran.');
    expect(f['github-token']!.metadata).toEqual({ encrypted: true });
    expect(f['deploy.notes']!.metadata).toEqual({ owner: 'ops', encrypted: true });
    expect(r.ok && r.text).not.toContain('fixture-token-value');
    expect(r.ok && r.text).not.toContain('Deploy on Fridays');
  }, 20_000);

  it('reads only the partition asked for: one fresh list, then one read per entry, all with its realm', async () => {
    boot();
    await runExport(REALM_B, opts({ mode: 'readable', password: '' }));
    const reads = requestLog.filter((x) => x.method === 'GET');
    expect(reads.map((x) => x.path)).toEqual(['/vault/keys', '/vault/keys/stripe-key']);
    expect(reads.every((x) => x.query.realm_id === REALM_B)).toBe(true);
    expect(requestLog.some((x) => x.method !== 'GET')).toBe(false);
  });

  it('progress counts every entry, then the end', async () => {
    boot();
    const seen: ExportProgress[] = [];
    await runExport(REALM_A, opts({ mode: 'readable', password: '', onProgress: (p) => seen.push(p) }));
    expect(seen[0]).toEqual({ done: 0, total: 3, waiting: 0 });
    expect(seen.at(-1)).toEqual({ done: 3, total: 3, waiting: 0 });
  });

  it('exportText of nothing is an empty object', () => {
    expect(exportText([])).toBe('{}');
  });

  it('keys an object would swallow (__proto__, constructor, prototype) are written as entries, and the count matches the file', () => {
    const keys = ['__proto__', 'constructor', 'prototype', 'normal'];
    const text = exportText(keys.map((key) => ({ key, value: `v-${key}`, metadata: null })));
    const pairs: Array<[string, unknown]> = [];
    JSON.parse(text, function (this: unknown, k, v) {
      if (this && k !== '' && typeof v === 'object' && v !== null && 'value' in v) pairs.push([k, (v as { value: unknown }).value]);
      return v;
    });
    expect(pairs.map(([k]) => k).sort()).toEqual([...keys].sort());
    expect(pairs.find(([k]) => k === '__proto__')?.[1]).toBe('v-__proto__');
  });

  it('keys are written in the sorted order, numeric names included', () => {
    const text = exportText(['a', '2', '10'].map((key) => ({ key, value: 'x', metadata: null })));
    expect([...text.matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1])).toEqual(['10', '2', 'a']);
  });

  it('Encrypted locks a plain value that only looks like an envelope; a valid envelope is still copied as is', async () => {
    const fake = '{"_enc":1,"note":"plain words"}';
    const { lockValues } = await import('./exportVault');
    const out = await lockValues(
      [
        { key: 'fake', value: fake, metadata: null },
        { key: 'real', value: ENV, metadata: null },
      ],
      PW,
    );
    expect(out[0]!.value).not.toBe(fake);
    expect(out[0]!.value).not.toContain('plain words');
    expect(await decrypt(out[0]!.value, PW)).toBe(fake);
    expect(out[0]!.metadata).toEqual({ encrypted: true });
    expect(out[1]!.value).toBe(ENV);
  }, 20_000);

  it('metadata too deep to write ends the export with a fixed result, never a throw', async () => {
    let tree: unknown = 'leaf';
    for (let i = 0; i < 20_000; i++) tree = [tree];
    boot('default', [
      reply(routes.list, () => answers.ok({ statusCode: 200, data: [{ key: 'deep', realm_id: REALM_A, metadata: { tree }, size_bytes: 4, created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:00:00Z' }] })),
      readOf('deep', () => answers.ok({ statusCode: 200, data: { key: 'deep', value: 'deep-value-01' } })),
    ]);
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '' }));
    expect(r).toEqual({ ok: false, why: 'serialize' });
  });
});

describe('the read loop', () => {
  it('an empty partition builds nothing', async () => {
    boot('empty');
    expect(await runExport(REALM_A, opts())).toEqual({ ok: false, why: 'empty' });
  });

  it('a list that cannot be read builds nothing', async () => {
    boot('error');
    expect(await runExport(REALM_A, opts())).toEqual({ ok: false, why: 'list' });
  });

  it('a Retry-After is waited out at most 5 times for one entry (6 reads), then that entry is named', async () => {
    let n = 0;
    boot('default', [readOf('github-token', () => (n++, { status: 429, body: { error: 'x' }, headers: { 'retry-after': '1' } }))]);
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '', sleep: () => Promise.resolve() }));
    expect(n).toBe(6);
    expect(r).toMatchObject({ ok: true, failed: ['github-token'] });
  });

  it('an access-key session reads no value: core refuses the list first, so nothing is built', async () => {
    boot('default', [fixtureSession({ kind: 'token', caps: ['vault'], realm: REALM_A })]);
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '' }));
    expect(r).toEqual({ ok: false, why: 'list' });
    expect(requestLog.filter((x) => x.path.startsWith('/vault/keys/'))).toHaveLength(0);
  });

  it('a Retry-After is waited out, then the same entry is read again', async () => {
    let n = 0;
    boot('default', [readOf('github-token', () => (n++ === 0 ? { status: 429, body: { error: 'x' }, headers: { 'retry-after': '7' } } : answers.ok({ statusCode: 200, data: { key: 'github-token', value: 'after-wait' } })))]);
    const sleep = vi.fn((_ms: number, _signal: AbortSignal) => Promise.resolve());
    const seen: ExportProgress[] = [];
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '', sleep, onProgress: (p) => seen.push(p) }));
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0]?.[0]).toBe(7000);
    expect(seen.some((p) => p.waiting === 7)).toBe(true);
    expect(parsed(r)['github-token']).toEqual({ value: 'after-wait' });
  });

  it('a Retry-After that keeps coming leaves that entry out, named', async () => {
    boot('default', [readOf('github-token', () => ({ status: 429, body: { error: 'x' }, headers: { 'retry-after': '1' } }))]);
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '', sleep: () => Promise.resolve() }));
    expect(r).toMatchObject({ ok: true, count: 2, failed: ['github-token'] });
    expect(Object.keys(parsed(r))).not.toContain('github-token');
  });

  it('a refused read (403) stops the export with nothing built', async () => {
    boot('default', [readOf('deploy.notes', () => answers.refused(403, 'INSUFFICIENT_PERMISSIONS'))]);
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '' }));
    expect(r).toEqual({ ok: false, why: 'refused', problem: { kind: 'forbidden' } });
  });

  it('an entry removed meanwhile (404) is left out and counted', async () => {
    boot('default', [readOf('deploy.notes', () => ({ status: 404, body: { error: 'Not Found' } }))]);
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '' }));
    expect(r).toMatchObject({ ok: true, count: 2, failed: [], gone: 1 });
  });

  it('an entry read back empty is left out and named, never written as an empty value', async () => {
    boot('default', [readOf('deploy.notes', () => answers.ok({ statusCode: 200, data: { key: 'deploy.notes', value: '' } }))]);
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '' }));
    expect(r).toMatchObject({ ok: true, count: 2, failed: ['deploy.notes'], gone: 0 });
    expect(Object.keys(parsed(r))).not.toContain('deploy.notes');
  });

  it('any other failed read is left out and named, never retried', async () => {
    let n = 0;
    boot('default', [readOf('deploy.notes', () => (n++, answers.pending5xx(503)))]);
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '' }));
    expect(r).toMatchObject({ ok: true, count: 2, failed: ['deploy.notes'], gone: 0 });
    expect(n).toBe(1);
  });

  it('Cancel stops the loop: nothing is built and no further entry is read', async () => {
    boot();
    const ac = new AbortController();
    const r = await runExport(REALM_A, opts({ mode: 'readable', password: '', signal: ac.signal, onProgress: (p) => p.done === 1 && ac.abort() }));
    expect(r).toEqual({ ok: false, why: 'cancelled' });
    expect(requestLog.filter((x) => x.path.startsWith('/vault/keys/'))).toHaveLength(1);
  });

  it('Cancel during a Retry-After wait ends it at once', async () => {
    boot('default', [readOf('db-password', () => ({ status: 429, body: { error: 'x' }, headers: { 'retry-after': '3600' } }))]);
    const ac = new AbortController();
    const p = runExport(REALM_A, opts({ mode: 'readable', password: '', signal: ac.signal, onProgress: (x) => x.waiting > 0 && setTimeout(() => ac.abort(), 0) }));
    expect(await p).toEqual({ ok: false, why: 'cancelled' });
  });

  it('no secure context: Encrypted builds nothing (crypto unavailable)', async () => {
    boot();
    vi.stubGlobal('isSecureContext', false);
    expect(await runExport(REALM_A, opts())).toEqual({ ok: false, why: 'crypto', kind: 'unavailable' });
  });
});

describe('the file name', () => {
  const d = new Date('2026-10-30T23:59:00Z');
  it.each([
    ['Personal', 'vault-personal-2026-10-30.json'],
    ['Global', 'vault-global-2026-10-30.json'],
    ['Acme client', 'vault-acme-client-2026-10-30.json'],
    ['../../etc/passwd', 'vault-etc-passwd-2026-10-30.json'],
    ['..', 'vault-export-2026-10-30.json'],
    ['秘密', 'vault-export-2026-10-30.json'],
    ['a'.repeat(80), `vault-${'a'.repeat(40)}-2026-10-30.json`],
    ['.hidden', 'vault-hidden-2026-10-30.json'],
  ])('%s → %s', (name, want) => {
    expect(exportFileName(name, d)).toBe(want);
  });
});
