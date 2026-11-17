/**
 * The Logs data rules (rules.ts): one predicate set per
 * view, search by shape, the per-source paths, the scheduler, the history window, page overflow, the
 * export drain's loss rules, error classes, the display boundary, the Scripts hand-off and share
 * links, and execution output. The network seams (kit reads, the route table, admission) belong to
 * core's declared routes and are covered by routes.test.ts.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- these tests feed the rules hostile and malformed input on purpose */
import { describe, test, expect } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import * as Rules from './rules';
import { readFileSync } from 'node:fs';
import { fakeClock, fakeLogsDb, query, rowsEvery, T0 } from './fake-kit';
import { HubLogsScrub as S } from './scrub';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');

// The tests probe the rules with hostile and malformed input on purpose, so they see the module untyped.
const D: any = Rules;
const CID = 'c0ffee000000000000000c01';
const H = 3_600_000;
const MIN = 60_000;
function P(view: Parameters<typeof Rules.predicate>[0], now = T0) {
  const r = D.predicate(view, now);
  if (!r.ok) throw new Error('predicate refused: ' + r.code);
  return r.P;
}
/** The predicate part of a kit query: everything but the cursor, the page size and buckets. */
function preds(path: string | null) {
  const q = query(path);
  for (const k of ['beforeId', 'afterId', 'limit', 'bucketMs']) delete q[k];
  return q;
}
const deep = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('predicates: what each source class asks the logs kit for', () => {
  test('visits are edge requests of every program except Bots; Bots are serviceName=bots; Everything reads both', () => {
    expect(preds(D.kitPath(P({ source: 'visits' }), null, 200))).toEqual({ source: 'edge', kind: 'request', excludeService: 'bots', sinceMs: String(T0 - H) });
    expect(preds(D.kitPath(P({ source: 'bots' }), null, 200))).toEqual({ source: 'edge', kind: 'request', serviceName: 'bots', sinceMs: String(T0 - H) });
    expect(preds(D.kitPath(P({ source: 'everything' }), null, 200))).toEqual({ source: 'edge', kind: 'request', sinceMs: String(T0 - H) });
    expect(preds(D.kitPath(P({ source: 'decisions' }), null, 200))).toEqual({ source: 'backend', sinceMs: String(T0 - H) });
  });

  test('"How it went": a status range for visits and Everything, a level list for Bots and proxy decisions', () => {
    const k = (v: any) => preds(D.kitPath(P(v), null, 200));
    expect(k({ source: 'visits', severity: 'problems' }).minStatus).toBe('400');
    expect(k({ source: 'visits', severity: 'failed' }).minStatus).toBe('500');
    expect(k({ source: 'everything', severity: 'failed' }).minStatus).toBe('500');
    expect(k({ source: 'visits', severity: 'all' }).minStatus).toBeUndefined();
    expect(k({ source: 'bots', severity: 'problems' })).toMatchObject({ level: 'warn,error' });
    expect(k({ source: 'bots', severity: 'failed' })).toMatchObject({ level: 'error' });
    expect(k({ source: 'bots', severity: 'failed' }).minStatus).toBeUndefined();
    expect(k({ source: 'decisions', severity: 'problems' })).toMatchObject({ level: 'warn,error' });
  });

  test('time windows: a preset is open-ended from now − window; "around a moment" is ±5 minutes; P freezes sinceMs', () => {
    expect(P({ source: 'visits', window: '15m' })).toMatchObject({ sinceMs: T0 - 15 * MIN, untilMs: null });
    expect(P({ source: 'visits', window: '7d' })).toMatchObject({ sinceMs: T0 - 168 * H, untilMs: null });
    const at = T0 - 2 * H;
    const a = P({ source: 'visits', window: { around: at } });
    expect(a).toMatchObject({ sinceMs: at - 5 * MIN, untilMs: at + 5 * MIN });
    expect(query(D.kitPath(a, null, 200))).toMatchObject({ sinceMs: String(at - 5 * MIN), untilMs: String(at + 5 * MIN) });
    for (const w of ['2h', '', { around: 'x' }, { around: -1 }, { around: 1.5 }]) expect(D.predicate({ source: 'visits', window: w }, T0)).toMatchObject({ ok: false, code: 'window_invalid' });
    expect(Object.isFrozen(a)).toBe(true);
  });

  test('every read of one view sends exactly P: newest page, older, newer, stats, problem groups, export pages', () => {
    const p = P({ source: 'visits', severity: 'problems', search: '/api/users', method: 'POST', window: '24h' });
    const base = preds(D.kitPath(p, null, 200));
    expect(base).toEqual({ source: 'edge', kind: 'request', excludeService: 'bots', minStatus: '400', path: '/api/users', method: 'POST', sinceMs: String(T0 - 24 * H) });
    for (const path of [D.kitPath(p, { beforeId: 50 }, 200), D.kitPath(p, { afterId: 9 }, 200), D.statsPath(p), D.kitPath(p, null, 1000), D.kitPath(p, { afterId: 0 }, 500)]) {
      expect(preds(path)).toEqual(base);
    }
    expect(D.statsPath(p).startsWith('/_logs/stats?')).toBe(true);
    expect(D.kitPath(p, null, 200).startsWith('/_logs?')).toBe(true);
  });

  test('kit queries use only the logs API keys: never offset or last, one cursor at most, page size bounded', () => {
    const allowed = new Set(['source', 'kind', 'serviceName', 'excludeService', 'level', 'status', 'minStatus', 'maxStatus', 'path', 'traceId', 'method', 'botUrl', 'sinceMs', 'untilMs', 'beforeId', 'afterId', 'limit']);
    const p = P({ source: 'bots', severity: 'failed', search: 'a1b2c3d4e5f60718', botUrl: 'bu_' + 'a'.repeat(24), window: { around: T0 - H } });
    for (const path of [D.kitPath(p, null, 200), D.kitPath(p, { beforeId: 3 }, 200), D.kitPath(p, { afterId: 3 }, 2000)]) {
      for (const k of Object.keys(query(path))) expect(allowed.has(k)).toBe(true);
    }
    expect(query(D.kitPath(p, { afterId: 3 }, 2000)).limit).toBe('1000');
    expect(() => D.kitPath(p, { afterId: 3, beforeId: 9 }, 200)).toThrow();
    expect(query(D.kitPath(p, null, 200))).toMatchObject({ botUrl: 'bu_' + 'a'.repeat(24), traceId: 'a1b2c3d4e5f60718' });
    // The server reads `botUrl`, and both routes declare it.
    expect(D.FILTER_KEYS).toContain('botUrl');
  });

  test('bad filters are refused, never dropped', () => {
    expect(D.predicate({ source: 'nope' }, T0)).toMatchObject({ ok: false, code: 'source_invalid' });
    expect(D.predicate({ source: 'visits', severity: 'bad' }, T0)).toMatchObject({ ok: false, code: 'severity_invalid' });
    expect(D.predicate({ source: 'visits', method: 'get;' }, T0)).toMatchObject({ ok: false, code: 'method_invalid' });
    expect(D.predicate({ source: 'bots', botUrl: 'bu_1' }, T0)).toMatchObject({ ok: false, code: 'bot_url_invalid' });
    expect(D.predicate({ source: 'visits', botUrl: 'bu_' + 'a'.repeat(24) }, T0)).toMatchObject({ ok: false, code: 'bot_url_unsupported' });
    expect(D.predicate({ source: 'changes', search: 'x' }, T0)).toMatchObject({ ok: false, code: 'search_unsupported' });
    expect(D.predicate({ source: 'changes', severity: 'failed' }, T0)).toMatchObject({ ok: false, code: 'severity_unsupported' });
    expect(D.predicate({ source: 'visits', search: 'x'.repeat(201) }, T0)).toMatchObject({ ok: false, code: 'search_too_long' });
  });

  test('Everything leaves out Changes for a filter Changes cannot carry, and says which', () => {
    expect(D.parts(P({ source: 'everything' }))).toEqual({ parts: ['kit', 'changes'], skipped: [] });
    expect(D.parts(P({ source: 'everything', severity: 'problems' }))).toEqual({ parts: ['kit'], skipped: [{ source: 'changes', reason: 'severity' }] });
    expect(D.parts(P({ source: 'everything', search: '/x' }))).toEqual({ parts: ['kit'], skipped: [{ source: 'changes', reason: 'search' }] });
    expect(D.parts(P({ source: 'visits' }))).toEqual({ parts: ['kit'], skipped: [] });
    expect(D.parts(P({ source: 'changes' }))).toEqual({ parts: ['changes'], skipped: [] });
  });
});

// ── search ───────────────────────────────────────────────────────────────

describe('search: one box, decided by shape', () => {
  test('hex ≥16 or a UUID → request ID; 3 digits 100–599 → status; anything else → a literal address substring', () => {
    expect(D.search('A1B2C3D4E5F60718')).toEqual({ kind: 'traceId', value: 'a1b2c3d4e5f60718' });
    expect(D.search(' 0199c3a2-6f10-7c4e-9b2a-000000000009 ')).toEqual({ kind: 'traceId', value: '0199c3a2-6f10-7c4e-9b2a-000000000009' });
    expect(D.search('a1b2c3d4e5f6071')).toEqual({ kind: 'path', value: 'a1b2c3d4e5f6071' });
    expect(D.search('404')).toEqual({ kind: 'status', value: 404 });
    expect(D.search('100')).toEqual({ kind: 'status', value: 100 });
    expect(D.search('599')).toEqual({ kind: 'status', value: 599 });
    expect(D.search('600')).toEqual({ kind: 'path', value: '600' });
    expect(D.search('099')).toEqual({ kind: 'path', value: '099' });
    expect(D.search('50%_off')).toEqual({ kind: 'path', value: '50%_off' });
    expect(D.search('   ')).toEqual({ kind: 'none' });
    expect(D.search('x'.repeat(201))).toEqual({ kind: 'invalid', code: 'search_too_long' });
  });

  test('the path value travels URL-encoded and literal (the server escapes LIKE)', () => {
    const q = D.kitPath(P({ source: 'visits', search: '50%_off&x=1' }), null, 200);
    expect(q).toContain('path=50%25_off%26x%3D1');
    expect(query(q).path).toBe('50%_off&x=1');
    expect(query(D.kitPath(P({ source: 'visits', search: '503' }), null, 200))).toMatchObject({ status: '503' });
  });
});

// ── per-source paths ───────────────────────────────────────────────────────

describe('source paths: Changes, Account, Scripts, program output', () => {
  test('Changes: this computer, the window as dates, newest first, offset pages ≤500', () => {
    const p = P({ source: 'changes', window: '24h' });
    expect(query(D.changesPath(p, CID, { offset: 500, limit: 500 }))).toEqual({
      computer_id: CID, start_date: new Date(T0 - 24 * H).toISOString(), sort_by: 'created_at', sort_order: 'desc', limit: '500', offset: '500',
    });
    expect(D.changesPath(p, CID, { offset: 0, limit: 900 })).toContain('limit=500');
    expect(D.changesPath(p, 'c1', { offset: 0, limit: 10 })).toBeNull();
    const a = P({ source: 'changes', window: { around: T0 } });
    expect(query(D.changesPath(a, CID, { offset: 0, limit: 100 })).end_date).toBe(new Date(T0 + 5 * MIN).toISOString());
  });

  test('Account: pages ≤100, status range from "How it went", method filter', () => {
    expect(query(D.accountPath(P({ source: 'account', severity: 'problems', method: 'DELETE' }), { page: 2, limit: 500 }))).toEqual({
      page: '2', limit: '100', start_date: new Date(T0 - H).toISOString(), min_status: '400', method: 'DELETE',
    });
    expect(query(D.accountPath(P({ source: 'account', severity: 'failed' }), { page: 1, limit: 50 })).min_status).toBe('500');
  });

  test('Scripts: by full path, status all|failed, limit ≤100, the server cursor verbatim; bad paths refused', () => {
    const p = P({ source: 'scripts', severity: 'failed', window: '7d' });
    expect(D.scriptsPath(p, { script: 'default/1/a/index.ts', before: 'opaque:cursor', limit: 250 })).toBe(
      '/api/v1/exec/logs/executions?scriptPath=default%2F1%2Fa%2Findex.ts&status=failed&since=' + encodeURIComponent(new Date(T0 - 168 * H).toISOString()) + '&limit=100&before=opaque%3Acursor');
    expect(query(D.scriptsPath(P({ source: 'scripts' }), { script: 'a.ts', limit: 20 })).status).toBe('all');
    for (const s of ['/abs.ts', '../x.ts', 'a/../b.ts', 'a\u0007.ts', 'x'.repeat(513), '', 'a\\..\\b']) expect(D.scriptsPath(p, { script: s, limit: 10 })).toBeNull();
  });

  test('program output: one program, one channel, lines ≤10,000, port only for port-range programs', () => {
    expect(D.programPath({ id: 'web-1', channel: 'stderr', lines: 2000 })).toBe('/api/v1/daemon/programs/web-1/logs?type=stderr&lines=2000');
    expect(D.programPath({ id: 'web-1', channel: 'stdout', lines: 50000, port: 8080 })).toBe('/api/v1/daemon/programs/web-1/logs?type=stdout&lines=10000&port=8080');
    expect(D.programPath({ id: 'web/1', channel: 'stdout', lines: 10 })).toBeNull();
    expect(D.programPath({ id: 'web', channel: 'both', lines: 10 })).toBeNull();
    expect(D.programPath({ id: 'web', channel: 'stdout', lines: 10, port: 70000 })).toBeNull();
  });
});

// ── seam: the kit target ─────────────────────────────────────────────────────

describe('error classes', () => {
  test('raw answers and seam codes map to the error classes', () => {
    const c = (e: any, running = true) => deep(D.problem(e, { running }));
    expect(c({ status: 401 })).toEqual({ code: 'private' });
    expect(c({ status: 403 })).toEqual({ code: 'private' });
    expect(c({ status: 429, code: 'audit_quota_exceeded', retryAfterMs: 60000 })).toEqual({ code: 'quota', retryAfterMs: 60000 });
    expect(c({ status: 429, data: { errorCode: 'rate_limited' } })).toEqual({ code: 'rate_limited' });
    expect(c({ status: 429, retryAfterMs: 4000 })).toEqual({ code: 'rate_limited', retryAfterMs: 4000 });
    expect(c({ status: 503, code: 'audit_write_failed' })).toEqual({ code: 'unavailable' });
    expect(c({ status: 400 })).toEqual({ code: 'bad_request' });
    expect(c({ status: 0 }, true)).toEqual({ code: 'blocked' });
    expect(c({ name: 'TypeError' }, true)).toEqual({ code: 'blocked' });
    expect(c({ status: 0 }, false)).toEqual({ code: 'unreachable' });
    for (const k of ['private', 'blocked', 'unreachable', 'unavailable', 'bad_request', 'too_large', 'aborted', 'stale']) expect(c({ code: k })).toEqual({ code: k });
    expect(c({ stale: true })).toEqual({ code: 'stale' });
    expect(c({ name: 'AbortError' })).toEqual({ code: 'aborted' });
    expect(c({ status: 500 })).toEqual({ code: 'failed', status: 500 });
  });

  test('kit rejections are read by kind first', () => {
    const c = (e: any, running = true) => deep(D.problem(e, { running }));
    expect(c({ kind: 'rate_limited', status: 429, code: 'rate_limited', retryAfterMs: 2000, retryAfter: 2 })).toEqual({ code: 'rate_limited', retryAfterMs: 2000 });
    expect(c({ kind: 'rate_limited', status: 429, code: 'slow_down', retryAfterMs: null })).toEqual({ code: 'rate_limited' });
    expect(c({ kind: 'quota', status: 429, code: 'quota', retryAfterMs: 60000 })).toEqual({ code: 'quota', retryAfterMs: 60000 });
    expect(c({ kind: 'private', status: 0, code: 'signin' })).toEqual({ code: 'private' });
    expect(c({ kind: 'bad_request', status: 422, code: 'level_invalid' })).toEqual({ code: 'bad_request' });
    expect(c({ kind: 'unavailable', status: 502, code: 'bad_gateway' })).toEqual({ code: 'unavailable' });
    expect(c({ kind: 'too_large', status: 200, code: 'too_large' })).toEqual({ code: 'too_large' });
    expect(c({ kind: 'aborted', status: 0, code: 'aborted' })).toEqual({ code: 'aborted' });
    expect(c({ kind: 'stale', status: 0, stale: true })).toEqual({ code: 'stale' });
    expect(c({ kind: 'stale', status: 0 })).toEqual({ code: 'stale' });
    // No answer: blocked only when the computer shows as running; a refused preflight is proof.
    expect(c({ kind: 'unreachable', status: 0, code: 'unreachable' }, true)).toEqual({ code: 'blocked' });
    expect(c({ kind: 'unreachable', status: 0, code: 'unreachable' }, false)).toEqual({ code: 'unreachable' });
    expect(c({ kind: 'preflight_refused', status: 0, code: 'preflight_refused' }, false)).toEqual({ code: 'blocked' });
    // Other 4xx and redirects fail with their status; a refusal before send keeps notSent.
    expect(c({ kind: 'refused', status: 404, code: 'not_found' })).toEqual({ code: 'failed', status: 404 });
    expect(c({ kind: 'redirected', status: 302, code: 'redirected' })).toEqual({ code: 'failed', status: 302 });
    expect(c({ kind: 'not_sent', status: 0, code: 'ROUTE_NOT_ALLOWED', notSent: true }, true)).toEqual({ code: 'failed', status: 0, notSent: true });
    expect(c({ code: 'NO_SHELL', notSent: true }, true)).toEqual({ code: 'failed', status: 0, notSent: true });
    expect(c({ kind: 'pending', status: 0, pending: true }, true)).toEqual({ code: 'failed', status: 0, pending: true });
    // The kind wins over a server code that looks like another class.
    expect(c({ kind: 'unavailable', status: 503, code: 'private' })).toEqual({ code: 'unavailable' });
    expect(c({ kind: 'refused', status: 409, code: 'bad_request' })).toEqual({ code: 'failed', status: 409 });
    expect(c({ kind: 'redirected', status: 307, code: 'private' })).toEqual({ code: 'failed', status: 307 });
    expect(c({ kind: 'aborted', status: 0 })).toEqual({ code: 'aborted' });
    // Stale and aborted win over the send flags: a queued abort or a stale ticket is never a plain failure.
    expect(c({ kind: 'aborted', status: 0, notSent: true })).toEqual({ code: 'aborted' });
    expect(c({ kind: 'stale', status: 0, notSent: true })).toEqual({ code: 'stale' });
  });
});

describe('page overflow: retry once with limit/4, then skip', () => {
  test('too_large → the same read at limit/4 (min 25); a second too_large → skipped', async () => {
    const asked: number[] = [];
    const big = (limit: number) => { asked.push(limit); return Promise.reject({ code: 'too_large' }); };
    expect(deep(await D.readPage(big, 200))).toEqual({ skipped: true, limit: 50 });
    expect(asked).toEqual([200, 50]);
    asked.length = 0;
    expect(deep(await D.readPage(big, 60))).toEqual({ skipped: true, limit: 25 });
    expect(asked).toEqual([60, 25]);
  });

  test('at the floor there is no pointless retry; a smaller page that fits is used', async () => {
    const asked: number[] = [];
    expect(deep(await D.readPage((l: number) => { asked.push(l); return Promise.reject({ code: 'too_large' }); }, 25))).toEqual({ skipped: true, limit: 25 });
    expect(asked).toEqual([25]);
    const r = await D.readPage((l: number) => (l > 200 ? Promise.reject({ code: 'too_large' }) : Promise.resolve({ entries: [{ id: 1 }] })), 500);
    expect(deep(r)).toEqual({ reply: { entries: [{ id: 1 }] }, limit: 125 });
  });

  test('other refusals pass through untouched', async () => {
    expect(await D.readPage(() => Promise.reject({ code: 'private' }), 200).then(() => 'ok', (e: any) => e)).toEqual({ code: 'private' });
  });
});

// ── scheduler ───────────────────────────────────────────────────────────

describe('scheduler: a client estimate per (computer, kit); server answers stay authoritative', () => {
  function sched() { const clock = fakeClock(); return { clock, S: D.createScheduler({ clock }) }; }
  const K = CID + '|logs';

  test('10 reads go at once, the 11th waits for the refill (0.5/s)', async () => {
    const { clock, S } = sched();
    const started: number[] = [];
    const ps = [];
    for (let i = 0; i < 11; i++) ps.push(S.run(K, 'list', () => { started.push(clock.now() - T0); return Promise.resolve(i); }));
    await clock.advance(0);
    expect(started.length).toBe(10);
    expect(S.state(K)).toMatchObject({ queued: 1 });
    await clock.advance(1999);
    expect(started.length).toBe(10);
    await clock.advance(1);
    expect(started).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000]);
    expect(await Promise.all(ps)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('priorities: list > stats > older page > export page, FIFO within one', async () => {
    const { clock, S } = sched();
    for (let i = 0; i < 10; i++) S.run(K, 'list', () => Promise.resolve());
    await clock.advance(0);
    const order: string[] = [];
    const mk = (n: string, p: string) => S.run(K, p, () => { order.push(n); return Promise.resolve(); });
    mk('e1', 'export'); mk('o1', 'older'); mk('s1', 'stats'); mk('l1', 'list'); mk('o2', 'older'); mk('l2', 'list');
    await clock.advance(60_000);
    expect(order).toEqual(['l1', 'l2', 's1', 'o1', 'o2', 'e1']);
  });

  test('export pages: at most one per 2 s, and never the last 3 tokens', async () => {
    const { clock, S } = sched();
    const at: number[] = [];
    for (let i = 0; i < 4; i++) S.run(K, 'export', () => { at.push(clock.now() - T0); return Promise.resolve(); });
    await clock.advance(10_000);
    expect(at).toEqual([0, 2000, 4000, 6000]);
    const { clock: c2, S: S2 } = sched();
    for (let i = 0; i < 7; i++) S2.run(K, 'list', () => Promise.resolve());
    await c2.advance(0);
    let ran = 0;
    S2.run(K, 'export', () => { ran++; return Promise.resolve(); });
    await c2.advance(0);
    expect(ran).toBe(0); // 3 tokens left: the reserve
    let listed = 0;
    S2.run(K, 'list', () => { listed++; return Promise.resolve(); });
    await c2.advance(0);
    expect(listed).toBe(1);
    await c2.advance(4000); // 3 + 2 tokens again
    expect(ran).toBe(1);
  });

  test('429 rate_limited empties the bucket and waits Retry-After, else 2 s; one paced retry, then it gives up', async () => {
    const { clock, S } = sched();
    const at: number[] = [];
    let n = 0;
    const p = S.run(K, 'list', () => { at.push(clock.now() - T0); return ++n === 1 ? Promise.reject({ code: 'rate_limited', retryAfterMs: 7000 }) : Promise.resolve('ok'); });
    await clock.advance(0);
    expect(S.state(K)).toMatchObject({ tokens: 0, waitMs: 7000, queued: 1 });
    expect(await clock.drive(p)).toBe('ok');
    expect(at).toEqual([0, 7000]);

    const { clock: c2, S: S2 } = sched();
    const at2: number[] = [];
    const p2 = S2.run(K, 'list', () => { at2.push(c2.now() - T0); return Promise.reject({ status: 429 }); });
    const out = await c2.drive(p2.then(() => 'ok', (e: any) => e));
    expect(out).toMatchObject({ code: 'rate_limited' });
    expect(at2).toEqual([0, 2000]);
  });

  test('audit_quota_exceeded stops every read for that computer until Retry; other computers go on', async () => {
    const { clock, S } = sched();
    let calls = 0;
    const p1 = S.run(K, 'list', () => { calls++; return Promise.reject({ status: 429, code: 'audit_quota_exceeded' }); });
    expect(await p1.then(() => 'ok', (e: any) => e)).toMatchObject({ code: 'quota' });
    expect(await S.run(K, 'stats', () => { calls++; return Promise.resolve(); }).then(() => 'ok', (e: any) => e)).toMatchObject({ code: 'quota', notSent: true });
    expect(calls).toBe(1);
    expect(await S.run('other|logs', 'list', () => Promise.resolve('fine'))).toBe('fine');
    S.resume(K);
    expect(await S.run(K, 'list', () => Promise.resolve('again'))).toBe('again');
    await clock.advance(0);
  });

  test('an aborted queued read never runs and rejects aborted, unsent', async () => {
    const { clock, S } = sched();
    for (let i = 0; i < 10; i++) S.run(K, 'list', () => Promise.resolve());
    await clock.advance(0);
    const ac = new AbortController();
    let ran = false;
    const p = S.run(K, 'older', () => { ran = true; return Promise.resolve(); }, { signal: ac.signal });
    ac.abort();
    expect(await p.then(() => 'ok', (e: any) => e)).toMatchObject({ code: 'aborted', notSent: true });
    await clock.advance(10_000);
    expect(ran).toBe(false);
    expect(S.state(K).queued).toBe(0);
  });

  test('the filter slot debounces 400 ms and aborts the read in flight', async () => {
    const clock = fakeClock();
    const slot = D.createSlot({ clock });
    const runs: string[] = [];
    const signals: any[] = [];
    const go = (n: string) => slot.submit((sig: any) => { runs.push(n); signals.push(sig); return new Promise(() => {}); });
    const a = go('a'); await clock.advance(100);
    const b = go('b'); await clock.advance(399);
    expect(runs).toEqual([]);
    await clock.advance(1);
    expect(runs).toEqual(['b']);
    expect(await a.then(() => 'ok', (e: any) => e)).toMatchObject({ code: 'aborted' });
    const c = go('c');
    expect(signals[0].aborted).toBe(true);
    expect(await b.then(() => 'ok', (e: any) => e)).toMatchObject({ code: 'aborted' });
    await clock.advance(400);
    expect(runs).toEqual(['b', 'c']);
    slot.cancel();
    expect(signals[1].aborted).toBe(true);
    expect(await c.then(() => 'ok', (e: any) => e)).toMatchObject({ code: 'aborted' });
  });
});

// ── window ───────────────────────────────────────────────────────

describe('history window: 2,000 rows and 8 MiB, evicted from the far end, the anchor fixed', () => {
  const r = (id: number, extra: any = {}) => ({ id, tsMs: T0 + id, url: '/p', ...extra });
  const desc = (hi: number, lo: number) => { const o = []; for (let i = hi; i >= lo; i--) o.push(r(i)); return o; };
  const asc = (lo: number, hi: number) => { const o = []; for (let i = lo; i <= hi; i++) o.push(r(i)); return o; };
  const ids = (w: any) => w.rows().map((x: any) => x.id);

  test('the first page is newest first; duplicates and rows without a positive integer id are dropped', () => {
    const w = D.createWindow();
    const out = w.reset([r(5), r(4), r(4), { id: 'x' }, { id: -1 }, { id: 1.5 }, r(3)], { limit: 200 });
    expect(ids(w)).toEqual([5, 4, 3]);
    expect(deep(out)).toMatchObject({ added: 3, malformed: 3 });
    expect(w.beforeId()).toBe(3);
    expect(w.afterId()).toBe(5);
    expect(w.state()).toMatchObject({ moreOlder: false, moreNewer: false });
    w.reset(desc(400, 201), { limit: 200 });
    expect(w.state().moreOlder).toBe(true);
  });

  test('older pages evict from the newest end past 2,000 rows; the anchor row stays', () => {
    const w = D.createWindow();
    w.reset(desc(3000, 2801), { limit: 200 });
    for (let hi = 2800; hi > 800; hi -= 200) w.older(desc(hi, hi - 199), { limit: 200, anchor: hi + 50 });
    expect(w.rows().length).toBe(2000);
    expect(w.afterId()).toBe(2800);
    expect(w.beforeId()).toBe(801);
    expect(w.state()).toMatchObject({ moreNewer: true, moreOlder: true });
    const o = w.newer(asc(2801, 3000), { limit: 200, anchor: 1500 });
    expect(deep(o).evicted).toEqual({ newest: 0, oldest: 200 });
    expect(w.afterId()).toBe(3000);
    expect(w.beforeId()).toBe(1001);
  });

  test('the anchor is never evicted: the incoming page is trimmed instead and stays fetchable', () => {
    const w = D.createWindow({ maxRows: 300 });
    w.reset(desc(1000, 801), { limit: 200 });
    w.older(desc(800, 601), { limit: 200, anchor: 1000 }); // anchor at the newest end
    expect(ids(w)[0]).toBe(1000);
    expect(w.rows().length).toBe(300);
    expect(w.beforeId()).toBe(701);
    expect(w.state()).toMatchObject({ moreOlder: true, moreNewer: false });
  });

  test('the byte cap evicts too: 2 × UTF-16 length of the retained strings', () => {
    const w = D.createWindow({ maxBytes: 10_000 });
    const fat = (id: number) => r(id, { url: 'x'.repeat(1100) }); // 2,200 bytes each
    w.reset([fat(10), fat(9), fat(8)], { limit: 200 });
    w.older([fat(7), fat(6), fat(5)], { limit: 200, anchor: 8 });
    expect(w.bytes()).toBeLessThanOrEqual(10_000);
    expect(ids(w)).toEqual([8, 7, 6, 5]);
    expect(w.state().moreNewer).toBe(true);
    // 2 × UTF-16 length of every string and key, plus 16 per value: 16 + (2+20) + (2+16+20+(16+2+18)) + (2+16).
    expect(D.estimateBytes({ a: 'ab', b: ['cd', { c: 'e' }], n: 5 })).toBe(130);
  });

  test('live rows join at the top only when the window is at the newest end; otherwise they are held', () => {
    const w = D.createWindow();
    w.reset(desc(10, 1), { limit: 200 });
    expect(deep(w.live([r(11), r(12), r(12)]))).toMatchObject({ added: 2, held: false });
    expect(ids(w).slice(0, 3)).toEqual([12, 11, 10]);
    const v = D.createWindow({ maxRows: 5 });
    v.reset(desc(20, 16), { limit: 5 });
    v.older(desc(15, 11), { limit: 5, anchor: 15 });
    expect(v.state().moreNewer).toBe(true);
    expect(deep(v.live([r(21)]))).toMatchObject({ added: 0, held: true });
    expect(v.afterId()).toBe(15);
  });
});

// ── export drain and loss marking ───────────────────────────────────────

describe('export drain: watermark walk and conservative "may be incomplete"', () => {
  const rowsOut = () => { const got: any[] = []; return { got, sink: (rows: any[]) => { got.push(...rows); return true; } }; };
  function drain(db: ReturnType<typeof fakeLogsDb>, view: any, o: any = {}) {
    const p = P(view);
    const { got, sink } = rowsOut();
    const sends: string[] = [];
    const get = (path: string) => { sends.push(path); if (o.before) o.before(sends.length, db); if (o.fail && o.fail(sends.length)) return Promise.reject(o.fail(sends.length)); return Promise.resolve(db.answer(path)); };
    return D.drainKit({ P: p, get, sink: o.sink || sink, nowMs: T0, lost: o.lost, maxRows: o.maxRows, pageRows: o.pageRows }).then((res: any) => ({ res: deep(res), got, sends }));
  }

  test('a window inside retention with nothing removed is complete: snapshot, then ascending pages to the watermark', async () => {
    const db = fakeLogsDb(rowsEvery(1200, T0 - 1000));
    const { res, got, sends } = await drain(db, { source: 'visits', window: '1h' });
    expect(res).toMatchObject({ rows: 1200, gap: false, partial: false, reasons: [], stop: 'done', newestId: 1200 });
    expect(got.map((x: any) => x.id)).toEqual(rowsEvery(1200, 0).map((x) => x.id));
    expect(query(sends[0])).toMatchObject({ limit: '1' });
    expect(query(sends[0]).afterId).toBeUndefined();
    expect(sends.slice(1).map((s: any) => [query(s).afterId, query(s).limit])).toEqual([['0', '500'], ['500', '500'], ['1000', '500']]);
    expect(deep(D.doneLines(res))).toEqual([{ line: 'complete' }]);
  });

  test('rows past the watermark are dropped and stop the walk', async () => {
    const db = fakeLogsDb(rowsEvery(600, T0 - 100_000));
    const { res, got, sends } = await drain(db, { source: 'visits' }, {
      before: (n: number, d: any) => { if (n === 2) d.rows.push(...rowsEvery(5, T0, 601)); },
    });
    expect(res).toMatchObject({ rows: 600, newestId: 600, stop: 'done', gap: false });
    expect(Math.max(...got.map((x: any) => x.id))).toBe(600);
    expect(sends.length).toBe(3);
  });

  test('(a) prefix eviction: a page whose retained.oldestId is past cursor + 1 marks a gap', async () => {
    const db = fakeLogsDb(rowsEvery(1500, T0 - 1000));
    const { res } = await drain(db, { source: 'visits' }, { before: (n: number, d: any) => { if (n === 3) d.pruneRows(700); } });
    expect(res).toMatchObject({ gap: true, partial: false, reasons: ['a'] });
    expect(deep(D.doneLines(res))).toEqual([{ line: 'removed' }]);
  });

  test('(a) also when the window reached the oldest kept row and the first page lost its start', async () => {
    const db = fakeLogsDb(rowsEvery(300, T0 - 1000));
    const { res } = await drain(db, { source: 'visits' }, { before: (n: number, d: any) => { if (n === 2) d.pruneRows(10); } });
    expect(res.reasons).toEqual(['a']);
  });

  test('(a) boundary: losing exactly the row after the cursor is a gap; losing only rows before it is not', async () => {
    const lose = await drain(fakeLogsDb(rowsEvery(1200, T0 - 1000)), { source: 'visits' }, { before: (n: number, d: any) => { if (n === 3) d.pruneRows(501); } });
    expect(lose.res.reasons).toEqual(['a']);
    const keep = await drain(fakeLogsDb(rowsEvery(1200, T0 - 1000)), { source: 'visits' }, { before: (n: number, d: any) => { if (n === 3) d.pruneRows(500); } });
    expect(keep.res).toMatchObject({ reasons: [], gap: false, rows: 1200 });
  });

  test('(a) when older rows were kept at the start, pruning past the window start before the first page is a gap', async () => {
    // 2 hours of rows, a 1-hour window: rows before the window are kept at the snapshot.
    const all = rowsEvery(7200, T0 - 1000);
    const cut = await drain(fakeLogsDb(all), { source: 'visits', window: '1h' }, { before: (n: number, d: any) => { if (n === 2) d.pruneAge(T0 - H + 60_000); } });
    expect(cut.res.reasons).toEqual(['a']);
    const fine = await drain(fakeLogsDb(all), { source: 'visits', window: '1h' }, { before: (n: number, d: any) => { if (n === 2) d.pruneAge(T0 - H - 60_000); } });
    expect(fine.res).toMatchObject({ reasons: [], gap: false });
  });

  test('a short page ends the walk without another read, even when the watermark row has gone', async () => {
    const db = fakeLogsDb(rowsEvery(700, T0 - 1000));
    const { res, sends } = await drain(db, { source: 'visits' }, { before: (n: number, d: any) => { if (n === 2) d.rows.pop(); } });
    expect(res).toMatchObject({ rows: 699, stop: 'done', newestId: 700 });
    expect(res.reasons).toEqual(['a']); // the watermark row was kept at the snapshot and went before the walk reached it
    expect(sends.length).toBe(3);
  });

  test('(b) the window starts within 15 minutes of the age cutoff: the [1,2,3] case is marked', async () => {
    const hours = 1;
    const cutoff = T0 - hours * H;
    // Age pruning goes by ts_ms, not id: row 3 is the oldest by time, so it ages out after the
    // walk passed ids 1-2 while retained.oldestId stays 1. Only the age margin catches it.
    const mk = (id: number, tsMs: number) => ({ id, tsMs, source: 'edge', kind: 'request', serviceName: 'files' });
    const db = fakeLogsDb([mk(1, cutoff + 5000), mk(2, cutoff + 6000), mk(3, cutoff + 1000)], { hours, maxRows: 50000, maxBytes: 1e8 });
    const { res, got } = await drain(db, { source: 'visits', window: '1h' }, { pageRows: 2, before: (n: number, d: any) => { if (n === 3) d.pruneAge(cutoff + 2000); } });
    expect(got.map((x: any) => x.id)).toEqual([1, 2]);
    // Row 3 was the scope's newest id, so its loss also lowers the watermark (a).
    expect(res).toMatchObject({ gap: true, reasons: ['a', 'b'], newestId: 3 });
    expect(deep(D.doneLines(res))).toEqual([{ line: 'removed' }, { line: 'not_kept', hours: 1 }]);
  });

  test('(b) not marked when the window starts more than 15 minutes inside retention', async () => {
    const db = fakeLogsDb(rowsEvery(10, T0 - 1000), { hours: 2, maxRows: 50000, maxBytes: 1e8 });
    const { res } = await drain(db, { source: 'visits', window: '1h' });
    expect(res).toMatchObject({ gap: false, reasons: [] });
    const near = await drain(fakeLogsDb(rowsEvery(10, T0 - 1000), { hours: 1.2, maxRows: 50000, maxBytes: 1e8 }), { source: 'visits', window: '1h' });
    expect(near.res.reasons).toEqual(['b']); // cutoff 72 min back, window 60 min: inside the 15-min margin
  });

  test('(c) a retention change during the walk marks a gap', async () => {
    const db = fakeLogsDb(rowsEvery(1200, T0 - 1000));
    const { res } = await drain(db, { source: 'visits' }, { before: (n: number, d: any) => { if (n === 3) d.retention.maxRows = 1000; } });
    expect(res).toMatchObject({ gap: true, reasons: ['c'] });
  });

  test('(d) a window that starts before what is kept', async () => {
    const db = fakeLogsDb(rowsEvery(10, T0 - 1000), { hours: 24, maxRows: 50000, maxBytes: 1e8 });
    const { res } = await drain(db, { source: 'visits', window: '7d' });
    expect(res.reasons).toEqual(['b', 'd']);
    expect(deep(D.doneLines(res))).toEqual([{ line: 'not_kept', hours: 24 }]);
  });

  test('(f) rows pruned before the export began: oldest kept row inside the window and not the first ever → may be missing', async () => {
    // Row/byte cap or a clear removed ids 1..500 earlier; the window reaches back past what is left.
    const { res, got } = await drain(fakeLogsDb(rowsEvery(1000, T0 - 1000, 501)), { source: 'visits', window: '1h' });
    expect(res).toMatchObject({ rows: 1000, gap: true, partial: false, reasons: ['f'], stop: 'done' });
    expect(got[0].id).toBe(501);
    expect(deep(D.doneLines(res))).toEqual([{ line: 'pruned' }]);
    // id 2 first: one row was removed.
    expect((await drain(fakeLogsDb(rowsEvery(10, T0 - 1000, 2)), { source: 'visits', window: '1h' })).res.reasons).toEqual(['f']);
  });

  test('(f) a computer that never pruned stays complete; so does a window that starts inside what is kept', async () => {
    const fresh = await drain(fakeLogsDb(rowsEvery(10, T0 - 1000, 1)), { source: 'visits', window: '1h' });
    expect(fresh.res).toMatchObject({ reasons: [], gap: false });
    expect(deep(D.doneLines(fresh.res))).toEqual([{ line: 'complete' }]);
    // Pruned long ago, but the oldest kept row is older than the window start (2 h of rows, 1 h window).
    const inside = await drain(fakeLogsDb(rowsEvery(7200, T0 - 1000, 501)), { source: 'visits', window: '1h' });
    expect(inside.res).toMatchObject({ reasons: [], gap: false });
    // Boundary: oldest kept row exactly at the window start is not flagged; 1 s later it is.
    const at = await drain(fakeLogsDb(rowsEvery(3601, T0, 501)), { source: 'visits', window: '1h' });
    expect(at.res.reasons).toEqual([]);
    const after = await drain(fakeLogsDb(rowsEvery(3600, T0, 501)), { source: 'visits', window: '1h' });
    expect(after.res.reasons).toEqual(['f']);
  });

  test('(f) with (d): one "may be missing" line, the retention one', async () => {
    const db = fakeLogsDb(rowsEvery(10, T0 - 1000, 50), { hours: 24, maxRows: 50000, maxBytes: 1e8 });
    const { res } = await drain(db, { source: 'visits', window: '7d' });
    expect(res.reasons).toEqual(['b', 'd', 'f']);
    expect(deep(D.doneLines(res))).toEqual([{ line: 'not_kept', hours: 24 }]);
  });

  test('(e) a page still too large at limit/4 stops the walk: gap and partial', async () => {
    const db = fakeLogsDb(rowsEvery(1200, T0 - 1000));
    const { res, got, sends } = await drain(db, { source: 'visits' }, { fail: (n: number) => (n >= 3 ? { code: 'too_large' } : null) });
    expect(res).toMatchObject({ gap: true, partial: true, reasons: ['e'], stop: 'too_large', rows: 500 });
    expect(got.length).toBe(500);
    expect(sends.slice(2).map((s: any) => query(s).limit)).toEqual(['500', '125']);
    expect(deep(D.doneLines(res))).toEqual([{ line: 'removed' }, { line: 'incomplete', stop: 'too_large' }]);
  });

  test('both kinds of reason give both done lines', async () => {
    const db = fakeLogsDb(rowsEvery(1200, T0 - 1000), { hours: 24, maxRows: 50000, maxBytes: 1e8 });
    const { res } = await drain(db, { source: 'visits', window: '7d' }, { before: (n: number, d: any) => { if (n === 3) d.retention.hours = 12; } });
    expect(res.reasons).toEqual(['b', 'c', 'd']);
    expect(deep(D.doneLines(res))).toEqual([{ line: 'removed' }, { line: 'not_kept', hours: 24 }]);
  });

  test('the 8,000-row cap and the sink refusing more both stop with partial', async () => {
    const db = fakeLogsDb(rowsEvery(1200, T0 - 1000));
    const { res, got } = await drain(db, { source: 'visits' }, { maxRows: 700 });
    expect(res).toMatchObject({ rows: 700, partial: true, stop: 'cap' });
    expect(got.length).toBe(700);
    const db2 = fakeLogsDb(rowsEvery(1200, T0 - 1000));
    const r2 = await drain(db2, { source: 'visits' }, { sink: () => false });
    expect(r2.res).toMatchObject({ partial: true, stop: 'cap' });
    expect(D.LIMITS.exportRows).toBe(8000);
  });

  test('"complete" only for stop done, not partial, no gap; every other stop says incomplete', () => {
    expect(deep(D.doneLines({ stop: 'done', partial: false, gap: false, reasons: [] }))).toEqual([{ line: 'complete' }]);
    for (const stop of ['failed', 'cancelled', 'cap', 'quota', 'needs_update', 'too_large']) {
      expect(deep(D.doneLines({ stop, partial: true, gap: false, reasons: [] }))).toEqual([{ line: 'incomplete', stop }]);
    }
    expect(deep(D.doneLines({ stop: 'done', partial: true, gap: false, reasons: [] }))).toEqual([{ line: 'incomplete', stop: 'done' }]);
    expect(deep(D.doneLines({ stop: 'failed', partial: true, gap: true, reasons: ['b'], retentionHours: 24 }))).toEqual([{ line: 'not_kept', hours: 24 }, { line: 'incomplete', stop: 'failed' }]);
    expect(deep(D.doneLines({ stop: 'done', partial: false, gap: true, reasons: [] }))).toEqual([{ line: 'incomplete', stop: 'done' }]);
    expect(deep(D.doneLines(null))).toEqual([{ line: 'incomplete', stop: 'failed' }]);
  });

  test('a refusing sink stops the walk as cap; refused rows are not counted', async () => {
    const db = fakeLogsDb(rowsEvery(1200, T0 - 1000));
    const p = P({ source: 'visits' });
    const sends: string[] = [];
    const res = await D.drainKit({ P: p, get: (path: string) => { sends.push(path); return Promise.resolve(db.answer(path)); }, sink: () => false, nowMs: T0 });
    expect(deep(res)).toMatchObject({ rows: 0, stop: 'cap', partial: true });
    expect(sends.length).toBe(2);
  });

  test('quota, a failed read and a lost ticket stop with partial; nothing is sent after a lost ticket', async () => {
    const q = await drain(fakeLogsDb(rowsEvery(1200, T0 - 1000)), { source: 'visits' }, { fail: (n: number) => (n === 3 ? { code: 'quota' } : null) });
    expect(q.res).toMatchObject({ partial: true, stop: 'quota', rows: 500 });
    const f = await drain(fakeLogsDb(rowsEvery(1200, T0 - 1000)), { source: 'visits' }, { fail: (n: number) => (n === 2 ? { code: 'unavailable' } : null) });
    expect(f.res).toMatchObject({ partial: true, stop: 'failed', rows: 0, error: { code: 'unavailable' } });
    let alive = true;
    const l = await drain(fakeLogsDb(rowsEvery(1200, T0 - 1000)), { source: 'visits' }, { lost: () => !alive, sink: (rows: any[]) => { alive = false; return rows.length > 0; } });
    expect(l.res).toMatchObject({ partial: true, stop: 'cancelled' });
    expect(l.sends.length).toBe(2);
  });

  test('a kit without the logs API reply fields is "needs an update": nothing is walked', async () => {
    const { res, sends } = await drain({ answer: () => ({ entries: [{ id: 3, tsMs: T0 }], total: 1, limit: 1, offset: 0 }) } as any, { source: 'visits' });
    expect(res).toMatchObject({ stop: 'needs_update', rows: 0 });
    expect(sends.length).toBe(1);
  });

  test('nothing to export: complete with zero rows after one snapshot read', async () => {
    const { res, sends } = await drain(fakeLogsDb([]), { source: 'visits' });
    expect(res).toMatchObject({ rows: 0, gap: false, partial: false, stop: 'done' });
    expect(deep(D.doneLines(res))).toEqual([{ line: 'complete' }]);
    expect(sends.length).toBe(1);
  });

  test('the logs API\'s empty scope is newestId and retained both null; a missing or half-null watermark needs an update', async () => {
    const ret = { hours: 168, maxRows: 50000, maxBytes: 100_000_000 };
    const empty = await drain({ answer: () => ({ entries: [], total: 0, limit: 1, offset: 0, newestId: null, retained: null, retention: ret }) } as any, { source: 'visits' });
    expect(empty.res).toMatchObject({ rows: 0, gap: false, partial: false, stop: 'done' });
    for (const w of [{}, { newestId: null, retained: { oldestId: 1, oldestTsMs: T0 } }, { newestId: 0, retained: null }, { newestId: 5 }]) {
      const r = await drain({ answer: () => ({ entries: [], total: 0, limit: 1, offset: 0, retention: ret, ...w }) } as any, { source: 'visits' });
      expect(r.res).toMatchObject({ stop: 'needs_update', partial: true });
    }
  });

  test('a clear during the export is a gap: before the first page, between pages, or a falling watermark', async () => {
    for (const at of [2, 3]) {
      const db = fakeLogsDb(rowsEvery(800, T0 - 1000));
      const { res } = await drain(db, { source: 'visits' }, { before: (n: number) => { if (n === at) db.rows = []; } });
      expect(res).toMatchObject({ gap: true, stop: 'done' });
      expect(res.reasons).toContain('a');
      expect(deep(D.doneLines(res))).not.toContainEqual({ line: 'complete' });
    }
    const db = fakeLogsDb(rowsEvery(800, T0 - 1000));
    // The newest rows deleted mid-walk (no new rows since): the scope's newest id falls below the watermark.
    const { res } = await drain(db, { source: 'visits' }, { before: (n: number) => { if (n === 3) db.rows = db.rows.slice(0, 700); } });
    expect(res.reasons).toContain('a');
  });

  test('wired through the scheduler, export pages are paced 2 s apart', async () => {
    const clock = fakeClock();
    const S = D.createScheduler({ clock });
    const db = fakeLogsDb(rowsEvery(1200, T0 - 1000));
    const at: number[] = [];
    const get = (path: string) => S.run(CID + '|logs', 'export', () => { at.push(clock.now() - T0); return Promise.resolve(db.answer(path)); });
    const res = await clock.drive(D.drainKit({ P: P({ source: 'visits' }), get, sink: () => true, nowMs: T0 }));
    expect(deep(res)).toMatchObject({ rows: 1200, stop: 'done' });
    expect(at).toEqual([0, 2000, 4000, 6000]);
  });
});

// ── row outcomes and the Everything merge ───────────────────────────────────

describe('row outcomes and merging by time', () => {
  test('outcome follows the same rule as the view\'s "How it went" predicate', () => {
    expect(D.outcome({ status: 200 }, 'visits')).toBe('ok');
    expect(D.outcome({ status: 404 }, 'visits')).toBe('problem');
    expect(D.outcome({ status: 502 }, 'everything')).toBe('failed');
    expect(D.outcome({ level: 'warn', status: 200 }, 'bots')).toBe('problem');
    expect(D.outcome({ level: 'error' }, 'decisions')).toBe('failed');
    expect(D.outcome({}, 'visits')).toBe('neutral');
    expect(D.outcome({ event_type: 'x' }, 'changes')).toBe('neutral');
  });

  test('Everything merges newest first by time; ties keep source order', () => {
    const kit = [{ id: 3, tsMs: 300 }, { id: 2, tsMs: 200 }, { id: 1, tsMs: 100 }];
    const ch = [{ id: 'e2', created_at: new Date(250).toISOString() }, { id: 'e1', created_at: new Date(100).toISOString() }, { id: 'bad', created_at: 'nope' }];
    const m = D.merge([{ src: 'kit', rows: kit }, { src: 'changes', rows: ch }]);
    expect(deep(m).map((x: any) => [x.src, x.row.id, x.t])).toEqual([['kit', 3, 300], ['changes', 'e2', 250], ['kit', 2, 200], ['kit', 1, 100], ['changes', 'e1', 100]]);
  });
});

// ── Changes and account export drains ──────────────────────────────

describe('Changes and account export drains: paged, at most 8 pages', () => {
  const ev = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: 'e' + (from + i), event_type: 'computer.started', created_at: new Date(T0 - (from + i) * 1000).toISOString() }));
  function run(kind: string, pages: (q: Record<string, string>, n: number) => any, o: any = {}) {
    const got: any[] = [], sends: string[] = [];
    const get = (path: string) => { sends.push(path); try { return Promise.resolve(pages(query(path), sends.length)); } catch (e) { return Promise.reject(e); } };
    return D.drainPages({ kind, P: P({ source: kind === 'changes' ? 'changes' : 'account', window: '24h' }), containerId: CID, get, sink: o.sink || ((r: any[]) => { got.push(...r); }), lost: o.lost })
      .then((res: any) => ({ res: deep(res), got, sends }));
  }

  test('Changes: offset pages of 500, newest first, until a short page', async () => {
    const all = ev(1200);
    const { res, got, sends } = await run('changes', (q) => ({ data: { events: all.slice(Number(q.offset), Number(q.offset) + Number(q.limit)), pagination: { total: 1200 } } }));
    expect(res).toEqual({ rows: 1200, partial: false, stop: 'done' });
    expect(got.length).toBe(1200);
    expect(sends.map((s: any) => [query(s).offset, query(s).limit, query(s).computer_id, query(s).sort_order])).toEqual([['0', '500', CID, 'desc'], ['500', '500', CID, 'desc'], ['1000', '500', CID, 'desc']]);
  });

  test('a refusing sink stops at once as cap: refused rows are not counted, no further page is read', async () => {
    const all = ev(1200);
    const full = await run('changes', (q) => ({ data: { events: all.slice(Number(q.offset), Number(q.offset) + Number(q.limit)) } }), { sink: () => false });
    expect(full.res).toEqual({ rows: 0, partial: true, stop: 'cap' });
    expect(full.sends.length).toBe(1);
    const short = await run('account', () => ({ data: ev(3) }), { sink: () => false });
    expect(short.res).toEqual({ rows: 0, partial: true, stop: 'cap' });
    let n = 0;
    const second = await run('changes', (q) => ({ data: { events: all.slice(Number(q.offset), Number(q.offset) + Number(q.limit)) } }), { sink: () => ++n < 2 });
    expect(second.res).toEqual({ rows: 500, partial: true, stop: 'cap' });
    expect(second.sends.length).toBe(2);
  });

  test('Changes: 8 full pages stop with partial; a row shifted onto the next page is counted once', async () => {
    const { res, sends, got } = await run('changes', (q) => {
      const off = Number(q.offset);
      return { data: { events: ev(500, off === 500 ? 499 : off) } }; // page 2 repeats e499
    });
    expect(res).toEqual({ rows: 3999, partial: true, stop: 'cap' });
    expect(sends.length).toBe(8);
    expect(new Set(got.map((x: any) => x.id)).size).toBe(got.length);
  });

  test('account: pages of 100 by page number; a failure, quota or lost ticket stops with partial', async () => {
    const rows = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ id: 'a' + (from + i), method: 'GET', path: '/x', status_code: 200 }));
    const ok = await run('account', (q) => ({ data: rows(Number(q.page) === 3 ? 7 : 100, (Number(q.page) - 1) * 100) }));
    expect(ok.res).toEqual({ rows: 207, partial: false, stop: 'done' });
    expect(ok.sends.map((s: any) => [query(s).page, query(s).limit])).toEqual([['1', '100'], ['2', '100'], ['3', '100']]);
    const bad = await run('account', (q, n) => { if (n === 2) throw { status: 502 }; return { data: rows(100, 0) }; });
    expect(bad.res).toMatchObject({ rows: 100, partial: true, stop: 'failed', error: { code: 'unavailable' } });
    const quota = await run('account', () => { throw { code: 'quota' }; });
    expect(quota.res).toMatchObject({ rows: 0, partial: true, stop: 'quota' });
    let n = 0;
    const lost = await run('account', () => ({ data: rows(100, 0) }), { lost: () => ++n > 2 });
    expect(lost.res).toMatchObject({ partial: true, stop: 'cancelled' });
    expect(lost.sends.length).toBe(1);
  });
});

// ── smart features ─────────────────────────────────────────────────────

describe('problem groups, stats series and the spike notice', () => {
  test('path templates hide ids, numbers and the query', () => {
    expect(D.pathTemplate('/users/123/orders/0af7651916cd43dd?x=1#h')).toBe('/users/:n/orders/:id');
    expect(D.pathTemplate('/a/123e4567-e89b-12d3-a456-426614174000/b')).toBe('/a/:id/b');
    expect(D.pathTemplate('/files/report2026final.pdf')).toBe('/files/report2026final.pdf');
    expect(D.pathTemplate('/t/aB3dE6gH9kLmN0pQ')).toBe('/t/:id');
    expect(D.pathTemplate('/static/app.js')).toBe('/static/app.js');
    expect(D.pathTemplate(null)).toBe('');
  });

  test('groups: program + method + path template + status class, problems only, biggest first, exact when all were read', () => {
    const e = (id: number, status: number, url: string, method = 'GET', serviceName = 'files') => ({ id, status, url, method, serviceName });
    const reply = { entries: [e(10, 502, '/x'), e(9, 404, '/f/9'), e(8, 500, '/f/8'), e(7, 404, '/f/7'), e(6, 200, '/f/6'), e(5, 404, '/f/5', 'POST'), e(4, 404, '/f/4')], total: 7 };
    const g = deep(D.groups(reply, P({ source: 'visits', severity: 'problems' })));
    expect(g.groups.map((x: any) => [x.key, x.count, x.newest.id])).toEqual([['files GET /f/:n 4xx', 3, 9], ['files GET /x 5xx', 1, 10], ['files GET /f/:n 5xx', 1, 8], ['files POST /f/:n 4xx', 1, 5]]);
    expect(g).toMatchObject({ read: 7, total: 7, exact: true });
    expect(D.groups({ ...reply, total: 5000 }, P({ source: 'visits' }))).toMatchObject({ read: 7, total: 5000, exact: false });
    const bots = deep(D.groups({ entries: [{ id: 1, level: 'warn', status: 200, url: '/v1/chat', method: 'POST', serviceName: 'bots' }, { id: 2, level: 'info', status: 500 }] }, P({ source: 'bots' })));
    expect(bots.groups.map((x: any) => x.key)).toEqual(['bots POST /v1/chat 2xx']);
  });

  test('series: 4xx/5xx for status sources, warn/error for level sources, missing counts as 0', () => {
    const cls = (a: number, b: number) => ({ '1xx': 0, '2xx': 9, '3xx': 0, '4xx': a, '5xx': b, none: 1 });
    const reply = { buckets: [{ startMs: 1, byLevel: { warn: 7, error: 1 }, byStatusClass: cls(2, 3) }, { startMs: 2, byLevel: {}, byStatusClass: { '4xx': -1 } }] };
    expect(deep(D.series(reply, P({ source: 'visits' })))).toEqual([{ startMs: 1, failed: 3, problems: 5 }, { startMs: 2, failed: 0, problems: 0 }]);
    expect(deep(D.series(reply, P({ source: 'bots' })))).toEqual([{ startMs: 1, failed: 1, problems: 8 }, { startMs: 2, failed: 0, problems: 0 }]);
    expect(deep(D.series({}, P({ source: 'visits' })))).toEqual([]);
  });

  test('spike: max(5, 4 × median of the previous 12), the newest such bucket; hidden under 13 buckets', () => {
    const base = [4, 1, 3, 2, 2, 3, 1, 2, 4, 3, 2, 3]; // unsorted; median 2.5 → threshold 10
    expect(D.spike(base)).toBe(null);
    expect(D.spike([...base.slice(0, 11), 50])).toBe(null); // 12 buckets
    expect(deep(D.spike([...base, 10]))).toEqual({ index: 12, count: 10, threshold: 10 });
    expect(D.spike([...base, 9])).toBe(null);
    expect(deep(D.spike(Array(12).fill(0).concat([5])))).toEqual({ index: 12, count: 5, threshold: 5 });
    expect(D.spike(Array(12).fill(0).concat([4]))).toBe(null);
    // the 12 before each candidate, not the 12 oldest; the newest spike wins
    const s = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 7];
    expect(deep(D.spike(s))).toEqual({ index: 14, count: 7, threshold: 5 });
    expect(deep(D.spike([...Array(12).fill(10), 39, 40]))).toEqual({ index: 13, count: 40, threshold: 40 });
    // a quiet start then a busy hour: the late 30 is ordinary next to the 10s before it
    expect(deep(D.spike([...Array(12).fill(0), ...Array(12).fill(10), 30]))).toEqual({ index: 17, count: 10, threshold: 5 });
  });
});

// ── hand-off, share links, storage ─────────────────────────────

describe('Scripts hand-off, share links and what may be stored', () => {
  const PID = 'abcdef000000000000000001', REALM = '0123456789abcdef01234567';
  const ok = { source: 'exec', from: 'scripts', computer: { projectId: PID, containerId: CID }, realm: REALM, script: 'default/1/jobs/nightly.ts', execId: '1', status: 'failed', executionId: 'exec_01', window: '24h' };
  const ctx = { realm: REALM, computers: [{ projectId: PID, containerId: CID }] };

  test('a valid hand-off becomes the session record', () => {
    expect(deep(D.handoff(ok, ctx))).toEqual({ source: 'scripts', computer: { projectId: PID, containerId: CID }, realm: REALM, script: 'default/1/jobs/nightly.ts', execId: '1', severity: 'failed', executionId: 'exec_01', window: '24h' });
    expect(deep(D.handoff({ ...ok, status: undefined, executionId: undefined, window: undefined }, ctx))).toMatchObject({ severity: 'all', executionId: null, window: null });
  });

  test('every key is checked; anything off asks to open it from Scripts again', () => {
    const bad: any[] = [
      { source: 'scripts' }, { from: 'home' }, { computer: { projectId: PID } }, { computer: { projectId: 'x', containerId: CID } },
      { realm: 'global' }, { realm: REALM.toUpperCase() }, { script: '/abs.ts' }, { script: 'a/../b.ts' }, { script: 'a\u0007.ts' }, { script: 'x'.repeat(513) },
      { script: 'a\\b.ts' }, { execId: '' }, { execId: 1 }, { execId: 'a b' }, { executionId: '../x' }, { status: 'problems' }, { window: '2d' },
      { computer: { projectId: PID, containerId: 'c0ffee000000000000000c02' } }, { computer: { projectId: 'abcdef000000000000000002', containerId: CID } },
    ];
    for (const b of bad) expect(deep(D.handoff({ ...ok, ...b }, ctx))).toEqual({ error: 'reopen' });
    expect(deep(D.handoff(ok, { ...ctx, computers: [] }))).toEqual({ error: 'reopen' });
    expect(deep(D.handoff(null, ctx))).toEqual({ error: 'reopen' });
    // ids are shape-checked even when the computer list holds the same value
    expect(deep(D.handoff({ ...ok, computer: { projectId: 'P1', containerId: CID } }, { ...ctx, computers: [{ projectId: 'P1', containerId: CID }] }))).toEqual({ error: 'reopen' });
    expect(deep(D.handoff({ ...ok, realm: 'global' }, { ...ctx, realm: 'global' }))).toMatchObject({ realm: 'global' });
  });

  test('share links carry the computer id and enumerated values only', () => {
    expect(D.linkFor({ computer: CID, source: 'visits', severity: 'failed', window: '24h', search: 'secret', requestId: 'abc' })).toBe('#c=' + CID + '&s=visits&b=failed&t=24h');
    expect(D.linkFor({ computer: CID, source: 'nope', severity: 'all', window: '3d' })).toBe('#c=' + CID);
    expect(D.linkFor({ source: 'visits' })).toBe('');
    expect(deep(D.parseLink('#c=' + CID + '&s=bots&b=problems&t=7d&q=token&ip=1.2.3.4'))).toEqual({ computer: CID, source: 'bots', severity: 'problems', window: '7d' });
    expect(deep(D.parseLink('#c=' + CID + '&s=__proto__&b=all&t=constructor'))).toEqual({ computer: CID });
    expect(D.parseLink('#s=visits')).toBe(null);
    expect(D.parseLink('')).toBe(null);
    expect(deep(D.parseLink(D.linkFor({ computer: CID, source: 'account', severity: 'problems', window: '15m' })))).toEqual({ computer: CID, source: 'account', severity: 'problems', window: '15m' });
  });

  test('storage keeps enumerated and shape-checked fields only: never search text, request ids or IPs', () => {
    const v = { name: 'Failed visits', source: 'visits', severity: 'failed', window: '7d', program: 'web.app', script: 'default/1/a.ts', status: { min: 400, max: 499 },
      model: 'hoody-ai/hoody-free', search: 'password=x', requestId: '0af7651916cd43dd', ip: '203.0.113.7', extra: 1 };
    expect(deep(D.storable(v))).toEqual({ name: 'Failed visits', source: 'visits', severity: 'failed', window: '7d', program: 'web.app', script: 'default/1/a.ts', status: { min: 400, max: 499 }, model: 'hoody-ai/hoody-free' });
    const off = { name: 'x'.repeat(41), source: 'nope', severity: 'some', window: '2h', program: '-bad', script: '../x', status: { min: 500, max: 400 }, model: 'no-slash' };
    expect(deep(D.storable(off))).toEqual({});
    expect(deep(D.storable({ name: 'a\nb' }))).toEqual({});
    expect(deep(D.storable({ name: '   ' }))).toEqual({});
    expect(deep(D.storable({ name: 'a\u0085b' }))).toEqual({});
    expect(deep(D.storable({ status: { min: 99, max: 200 } }))).toEqual({});
    expect(deep(D.storable({ status: { min: 100, max: 600 } }))).toEqual({});
    expect(deep(D.storable({ status: { min: 500, max: 500 } }))).toEqual({ status: { min: 500, max: 500 } });
    expect(deep(D.storable(null))).toEqual({});
  });

  // The model a view saves is a catalogue spec. The whole catalogue must round-trip; a missing
  // catalogue is a failure, not a skip. Outside the monorepo there is no catalogue to read, and the test is skipped.
  const PROVIDERS = monorepoPath(process.env.HOODY_PROVIDERS_JSON, 'hoody-kit', 'hoody-agent', 'internal', 'providers', 'providers.json');
  test.skipIf(PROVIDERS === null)('a saved model is any catalogue spec, \'@\' and \'~\' included, and nothing that can leave the value', () => {
    const file = PROVIDERS ?? '';
    const specs: string[] = JSON.parse(readFileSync(file, 'utf8')).providers.flatMap((p: any) => p.models.map((m: any) => m.spec));
    expect(specs.length).toBeGreaterThan(7000);
    expect(specs.some((s) => s.includes('@')) && specs.some((s) => s.includes('~'))).toBe(true);
    expect(specs.filter((s) => D.storable({ model: s }).model !== s)).toEqual([]);
    for (const ok of ['openrouter/~anthropic/claude-x-latest', 'p/m@2024-01-01', 'wafer.ai/m', 'p/a:b_c.d-e', 'x'.repeat(64) + '/' + 'm'.repeat(200)]) {
      expect(D.storable({ model: ok }).model).toBe(ok);
    }
    for (const bad of ['a/../b', 'a/./b', 'a/.b', '../a/b', './a', '.a/b', '..', 'a//b', 'a/b/', 'a/', '/a', 'no-slash', 'a/b c', 'a /b', 'a/b\n', 'a/b\t',
      'a/b\u0000', 'a/b\u007f', 'a/b\u2028', 'a/b\u00a0', 'a/b%2e', 'a/b?x', 'a/b#x', 'a\\b/c', 'a/b\\c', 'a/<b>', 'a/b"', "a/b'", 'a@b/c', 'a~b/c',
      'x'.repeat(65) + '/m', 'p/' + 'm'.repeat(201), 7, null]) {
      expect(D.storable({ model: bad }).model).toBeUndefined();
    }
  });
});

// ── the display boundary ────────────────────

describe('display boundary: every row is scrubbed whole before it is kept, grouped, cut or shown', () => {
  const KEY = 'hbk_' + 'A'.repeat(30);
  const row = (id: number, extra: any = {}) => ({ id, tsMs: T0 - id, level: 'info', status: 500, source: 'edge', kind: 'request', serviceName: 'files', method: 'GET', url: '/f/' + id, ...extra });

  test('history window: reset, older, newer and live rows are scrubbed (values, credential keys, secret keys)', () => {
    const w = D.createWindow();
    w.reset([row(3, { url: '/x?token=' + KEY, data: { password: 'p', ['n ' + KEY]: 1 } })], { limit: 200 });
    w.older([row(2, { url: '/a/' + KEY })], { limit: 200 });
    w.newer([row(4, { traceId: KEY })], { limit: 200 });
    w.live([row(5, { url: KEY })]);
    expect(w.rows().map((x: any) => x.id)).toEqual([5, 4, 3, 2]);
    expect(JSON.stringify(w.rows())).not.toContain('hbk_');
    expect(w.rows().find((x: any) => x.id === 3).data.password).toBe('[REDACTED]');
  });

  test('a row over 64 KiB after the scrub becomes a bounded placeholder keeping id, time and the filter fields', () => {
    const w = D.createWindow();
    w.reset([row(1, { data: { blob: 'x'.repeat(40000) } })], { limit: 200 });
    expect(deep(w.rows())).toEqual([{ id: 1, tsMs: T0 - 1, status: 500, level: 'info', method: 'GET', source: 'edge', kind: 'request', serviceName: 'files', truncated: true }]);
    expect(w.bytes()).toBeLessThan(1000);
    w.reset([row(2, { serviceName: 'svc ' + KEY, method: 'M'.repeat(65), data: { blob: 'x'.repeat(40000) } })], { limit: 200 });
    expect(deep(w.rows())[0]).toMatchObject({ id: 2, serviceName: 'svc [REDACTED]', truncated: true });
    expect('method' in w.rows()[0]).toBe(false); // over 64 units: left out
    // 100 rows with distinct ~60,000-character keys once estimated 0 bytes.
    const v = D.createWindow();
    v.reset(Array.from({ length: 100 }, (_, i) => row(100 - i, { ['k' + i + 'x'.repeat(60000)]: 1 })), { limit: 200 });
    expect(v.rows().length).toBe(100);
    expect(v.rows().every((x: any) => x.truncated === true)).toBe(true);
    expect(v.bytes()).toBeLessThan(100_000);
    expect(D.estimateBytes({ ['k'.repeat(60000)]: 1 })).toBeGreaterThanOrEqual(120_000);
  });

  test('a JSON "__proto__" payload counts toward the row cap and the window bytes (100 rows)', () => {
    const proto = (id: number, n: number) => JSON.parse(JSON.stringify(row(id)).replace(/}$/, ',"data":{"inner":{"__proto__":{"blob":"' + 'x'.repeat(n) + '"}}}}'));
    const w = D.createWindow();
    w.reset([proto(1, 40000)], { limit: 200 });
    expect(deep(w.rows())[0]).toMatchObject({ id: 1, truncated: true }); // over 64 KiB: a placeholder
    const v = D.createWindow();
    v.reset(Array.from({ length: 140 }, (_, i) => proto(140 - i, 32000)), { limit: 200 }); // ~64 KB each, kept whole; ~9 MB in all
    expect(v.bytes()).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(v.rows().length).toBeLessThan(140); // evicted by bytes, as plain keys would be
    expect(v.rows().some((x: any) => x.truncated)).toBe(false);
    expect(v.rows().every((x: any) => x.data.inner.blob === undefined && Object.keys(x.data.inner).join() === '__proto__')).toBe(true);
  });

  test('groups: labels, path templates and the newest row are scrubbed; a template is scrubbed before its cut', () => {
    const url = '/safe/'.repeat(31) + KEY;
    expect(D.pathTemplate(url)).not.toContain('hbk_');
    expect(D.pathTemplate(url)).not.toContain('AAAAAAAAAA');
    expect(D.pathTemplate(url).length).toBeLessThanOrEqual(200);
    const g = D.groups({ entries: [row(1, { url, serviceName: 'svc ' + KEY }), row(2, { url: '/u/' + KEY + '/x', method: 'POST' })] }, P({ source: 'visits', severity: 'problems' }));
    expect(g.groups.length).toBe(2);
    expect(JSON.stringify(g)).not.toContain('hbk_');
  });

  test('norm returns a scrubbed copy and leaves the input as it was', () => {
    const raw = row(7, { url: '/x/' + KEY });
    const n = D.norm(raw);
    expect(n.url).toBe('/x/[REDACTED]');
    expect(raw.url).toBe('/x/' + KEY);
    expect(D.norm(null)).toBe(null);
  });
});

// ── execution output, the AI helper, Visits of exec ─────────────────


describe('execution output: exec POST logs/read, labelled "Recent output (may be incomplete)"', () => {
  test('the body: an execution id as exec checks it, lines 1–10,000, 200 by default', () => {
    expect(deep(D.execReadBody({ executionId: 'ex_1-A' }))).toEqual({ executionId: 'ex_1-A', lines: 200 });
    expect(deep(D.execReadBody({ executionId: 'e', lines: 50 }))).toEqual({ executionId: 'e', lines: 50 });
    expect(D.execReadBody({ executionId: 'e', lines: 0 }).lines).toBe(1);
    expect(D.execReadBody({ executionId: 'e', lines: 10_000 }).lines).toBe(10_000);
    expect(D.execReadBody({ executionId: 'e', lines: 10_001 }).lines).toBe(10_000);
    expect(D.execReadBody({ executionId: 'e', lines: 12.7 }).lines).toBe(12);
    expect(D.execReadBody({ executionId: 'x'.repeat(64) }).executionId).toBe('x'.repeat(64));
    for (const id of ['', 'x'.repeat(65), 'a/b', '../a', 'a.b', 'a b', 'a\n', 7, null, undefined, ['a']]) expect(D.execReadBody({ executionId: id })).toBeNull();
    expect(D.execReadBody()).toBeNull();
  });

  test('the reply is scrubbed whole, then split: a key that spans lines goes, which a line-by-line scrub would keep', () => {
    const pem = [fake('-----BEGIN ', 'PRIVATE KEY-----'), 'hello world body', '-----END PRIVATE KEY-----'];
    const lines = ['start', ...pem, fake('token=ghp_', 'abcdefghijklmnopqrstuvwxyz0123456789'), 'done'];
    expect(pem.map((l) => S.strip(l))).toContain('hello world body');
    const out = deep(D.execOutput({ executionId: 'ex1', lines, totalLines: 6, returnedLines: 6 }));
    expect(out.text).toBe(S.stripSnapshot(lines.join('\n')));
    expect(out.lines).toEqual(out.text.split('\n'));
    expect(out.text).not.toContain('hello world body');
    expect(out.text).not.toContain('ghp_');
    expect(out.lines[0]).toBe('start');
    expect(out.lines[out.lines.length - 1]).toBe('done');
  });

  // ── the reply is a snapshot: window-edge rules and plain text first ──
  const b64 = (n: number, ch = 'A') => (ch + 'b3dE6gH9k+/'.repeat(Math.ceil(n / 11) + 1)).slice(0, n);
  const EDGE: Array<[string, string[], string[]]> = [
    ['an orphan END', ['MIIEowIBAAKCAQEAfake', 'body==', '-----END RSA PRIVATE KEY-----', 'server up'], ['MIIEow', 'body==']],
    ['a base64 run', ['before', b64(64), b64(64, 'B'), b64(48, 'C'), 'after'], [b64(64).slice(0, 40), b64(48, 'C').slice(0, 40)]],
    ['a key split by an escape over two lines', ['API_\u001b[31mKEY="first', 'second"'], ['first', 'second', '\u001b']],
    // What plain() alone would expose
    ['an ESC before a private tag', ['\u001b<private>synthetic-hidden-value</private>'], ['synthetic-hidden-value']],
    ['an ESC before each PEM marker', ['\u001b-----BEGIN PRIVATE\x20KEY-----', 'fakebodyAAAA', '\u001b-----END PRIVATE KEY-----'], ['fakebodyAAAA']],
    ['a CR inside a quoted value', ['API_KEY="first\\\r\\"middle', 'second"'], ['middle', 'second']],
    ['a NUL inside a quoted value', ['API_KEY="first\\\u0000\\"middle', 'second"'], ['middle', 'second']],
    // A marker or a tag inside an escape, a lone surrogate
    ['an OSC (BEL) holding a marker', ['API_\u001b]0;[REDACTED]\u0007KEY="first', 'second"'], ['first', 'second']],
    ['an OSC (ESC \\) holding a marker', ['API_\u001b]0;[REDACTED]\u001b\\KEY="first', 'second"'], ['first', 'second']],
    ['an OSC holding a private tag', ['API_\u001b]0;<private>synthetic</private>\u0007KEY="first', 'second"'], ['first', 'second', 'synthetic']],
    ['a lone surrogate in the name', ['API_\ud800KEY="first', 'second"'], ['first', 'second']],
    // A marker ending a CSI
    ['a marker ending a CSI before a line-split value', ['prefix to\u001b[31mken="CANARY123\u001b[1;[REDACTED]', 'CANARY456"'], ['ANARY123', 'ANARY456']],
    ['a marker ending a CSI before a split name', ['\u001b[1;[REDACTED]pass\u001b[31mword="UNIQUECANARY123', 'SECONDVALUE456"'], ['NIQUECANARY', 'ECONDVALUE']],
  ];
  test('execOutput: an orphan END, a base64 run and an escape-split key never show', () => {
    for (const [, lines, gone] of EDGE) {
      const out = deep(D.execOutput({ lines, totalLines: lines.length }));
      for (const g of gone) expect(out.text).not.toContain(g);
      expect(out.text).toContain('[REDACTED]');
      expect(out.lines).toEqual(out.text.split('\n'));
    }
  });
  test('always labelled "may be incomplete"; more when exec left lines out; counts are numbers or the lines read', () => {
    const o = (r: any) => deep(D.execOutput(r));
    expect(o({ lines: ['a', 'b'], totalLines: 2, returnedLines: 2 })).toEqual({ label: 'recent_output', partial: true, lines: ['a', 'b'], text: 'a\nb', returned: 2, total: 2, more: false });
    expect(o({ lines: ['a', 'b'], totalLines: 900, returnedLines: 2 })).toMatchObject({ partial: true, returned: 2, total: 900, more: true });
    expect(o({ lines: ['a'] })).toMatchObject({ returned: 1, total: 1, more: false });
    expect(o({ lines: ['a'], totalLines: -1, returnedLines: '1' })).toMatchObject({ returned: 1, total: 1, more: false });
    expect(o({ lines: ['a', 'b'], totalLines: 1 })).toMatchObject({ returned: 2, total: 2, more: false });
    expect(o({ lines: [] })).toEqual({ label: 'recent_output', partial: true, lines: [], text: '', returned: 0, total: 0, more: false });
    expect(o({ lines: [1, null, 'x'] }).lines).toEqual(['1', '', 'x']);
  });

  test('a reply without a lines list "needs an update"', async () => {
    for (const r of [null, {}, { lines: 'a' }, { data: { lines: ['a'] } }]) expect(D.execOutput(r)).toBeNull();
    expect(D.execOutput({ totalLines: 3 })).toBeNull();
  });
});


describe('the AI helper: agent /logs, no realm, credentials include', () => {
  const HP = (v: any = {}) => P({ source: 'helper', ...v });

  test('the list path: since/until as RFC3339, the search box as text, min_level from "How it went", a page ≤500', () => {
    expect(D.helperPath(HP({ severity: 'problems', search: 'Disk Full', window: '24h' }))).toBe(
      '/logs?since=' + encodeURIComponent(new Date(T0 - 24 * H).toISOString()) + '&text=Disk%20Full&min_level=warn&limit=200');
    expect(query(D.helperPath(HP({ severity: 'failed', window: { around: T0 } }), { before_seq: 77, limit: 900 }))).toEqual({
      since: new Date(T0 - 5 * MIN).toISOString(), until: new Date(T0 + 5 * MIN).toISOString(), min_level: 'error', before_seq: '77', limit: '500',
    });
    expect(query(D.helperPath(HP(), { limit: 0 }))).toEqual({ since: new Date(T0 - H).toISOString(), limit: '1' });
    expect(query(D.helperPath(HP(), { limit: 37 })).limit).toBe('37');
    for (const b of [0, -1, 1.5, '7', null, NaN]) expect(query(D.helperPath(HP(), { before_seq: b })).before_seq).toBeUndefined();
    expect(query(D.helperPath(HP(), { before_seq: 1 })).before_seq).toBe('1');
  });

  test('every search shape travels as the literal text (the agent matches it case-insensitively)', () => {
    for (const [box, text] of [['0af7651916cd43dd', '0af7651916cd43dd'], ['404', '404'], ['/api/x?y=1', '/api/x?y=1'], ['  spaced  ', 'spaced']]) {
      expect(query(D.helperPath(HP({ search: box }))).text).toBe(text);
    }
  });

  test('the export path: the same predicates, limit 8000, txt unless jsonl is asked for', () => {
    const p = HP({ severity: 'problems', search: 'disk', window: { around: T0 } });
    expect(query(D.helperExportPath(p))).toEqual({
      since: new Date(T0 - 5 * MIN).toISOString(), until: new Date(T0 + 5 * MIN).toISOString(), text: 'disk', min_level: 'warn', limit: '8000', format: 'txt',
    });
    expect(D.helperExportPath(p, { format: 'jsonl' }).startsWith('/logs/export?')).toBe(true);
    expect(query(D.helperExportPath(p, { format: 'jsonl' })).format).toBe('jsonl');
    expect(query(D.helperExportPath(p, { format: 'csv' })).format).toBe('txt');
  });

  test('another source gets no helper path; the helper takes no method, Bot or kit filter', () => {
    for (const v of [{ source: 'visits' }, { source: 'bots' }, { source: 'execVisits' }]) {
      expect(D.helperPath(P(v))).toBeNull();
      expect(D.helperExportPath(P(v))).toBeNull();
    }
    expect(D.predicate({ source: 'helper', method: 'GET' }, T0)).toEqual({ ok: false, code: 'method_unsupported' });
    expect(D.predicate({ source: 'helper', botUrl: 'bu_' + 'a'.repeat(24) }, T0)).toEqual({ ok: false, code: 'bot_url_unsupported' });
    expect(D.kitPath(HP(), null, 10)).toBeNull();
    expect(deep(D.parts(HP()))).toEqual({ parts: ['helper'], skipped: [] });
  });

  test('helperNext: the oldest seq this page returned, or null once a page comes back short', () => {
    expect(D.helperNext({ entries: [{ seq: 30 }, { seq: 12 }, { seq: 20 }] }, 3)).toBe(12);
    expect(D.helperNext({ entries: [{ seq: 30 }, { seq: 12 }, { seq: 20 }] }, 4)).toBeNull();
    expect(D.helperNext({ entries: [{ seq: '9' }, { seq: 5 }, { seq: 0 }, { seq: 1.5 }, null] }, 5)).toBe(5);
    expect(D.helperNext({ entries: [{ seq: 'x' }, {}] }, 2)).toBeNull();
    for (const r of [null, {}, { entries: [] }, { entries: 'a' }]) expect(D.helperNext(r, 1)).toBeNull();
  });

});


describe('Visits of exec: the fallback while Scripts has no per-script logs', () => {
  const PID = 'abcdef000000000000000001', REALM = '0123456789abcdef01234567';
  const st = { source: 'exec', from: 'scripts', computer: { projectId: PID, containerId: CID }, realm: REALM, script: 'jobs/a.ts', execId: '1', status: 'failed', window: '24h' };
  const ctx = { realm: REALM, computers: [{ projectId: PID, containerId: CID }] };

  test('edge requests of the exec program, filtered and searched like Visits', () => {
    expect(Rules.SOURCE_IDS).toContain('execVisits');
    expect(preds(D.kitPath(P({ source: 'execVisits' }), null, 200))).toEqual({ source: 'edge', kind: 'request', serviceName: 'exec', sinceMs: String(T0 - H) });
    expect(preds(D.kitPath(P({ source: 'execVisits', severity: 'problems', search: '/run/x', method: 'POST' }), null, 200)))
      .toMatchObject({ serviceName: 'exec', minStatus: '400', path: '/run/x', method: 'POST' });
    expect(deep(D.basePairs(P({ source: 'execVisits', severity: 'failed' })))).toEqual([['source', 'edge'], ['kind', 'request'], ['serviceName', 'exec']]);
    expect(D.predicate({ source: 'execVisits', botUrl: 'bu_' + 'a'.repeat(24) }, T0)).toEqual({ ok: false, code: 'bot_url_unsupported' });
    expect(D.outcome({ status: 502 }, 'execVisits')).toBe('failed');
  });

  test('links and saved views keep it', () => {
    expect(D.linkFor({ computer: CID, source: 'execVisits' })).toBe('#c=' + CID + '&s=execVisits');
    expect(deep(D.parseLink('#c=' + CID + '&s=execVisits'))).toEqual({ computer: CID, source: 'execVisits' });
    expect(deep(D.storable({ source: 'execVisits' }))).toEqual({ source: 'execVisits' });
  });

  test('execFallback turns a hand-off record into that view and says why', () => {
    const rec = D.handoff(st, ctx);
    expect(deep(D.execFallback(rec))).toEqual({ view: { source: 'execVisits', severity: 'failed', window: '24h' }, note: 'scripts_need_update' });
    expect(deep(D.execFallback(D.handoff({ ...st, status: undefined, window: undefined }, ctx)))).toEqual({ view: { source: 'execVisits', severity: 'all', window: '1h' }, note: 'scripts_need_update' });
    expect(D.predicate(D.execFallback(rec).view, T0).ok).toBe(true);
    for (const r of [null, undefined, { error: 'reopen' }, { source: 'visits' }]) expect(D.execFallback(r)).toBeNull();
  });
});


describe('Programs hand-off', () => {
  const PID = 'abcdef000000000000000001', REALM = '0123456789abcdef01234567';
  const ok = { from: 'programs', source: 'programs', computer: { projectId: PID, containerId: CID }, realm: REALM, program: '3', port: 8001 };
  const ctx = { realm: REALM, computers: [{ projectId: PID, containerId: CID }] };

  test('a valid hand-off becomes the record: source, computer, realm, program and port', () => {
    expect(deep(D.handoff(ok, ctx))).toEqual({ source: 'programs', computer: { projectId: PID, containerId: CID }, realm: REALM, program: '3', port: 8001 });
    expect(deep(D.handoff({ ...ok, port: undefined }, ctx))).toEqual({ source: 'programs', computer: { projectId: PID, containerId: CID }, realm: REALM, program: '3', port: null });
    expect(deep(D.handoff({ ...ok, program: '4294967295', port: 1 }, ctx))).toMatchObject({ program: '4294967295', port: 1 });
    expect(deep(D.handoff({ ...ok, port: 65535 }, ctx))).toMatchObject({ port: 65535 });
    expect(deep(D.handoff({ ...ok, realm: 'global' }, { ...ctx, realm: 'global' }))).toMatchObject({ source: 'programs', realm: 'global' });
  });

  test('every key is checked, and a key it does not know is refused', () => {
    const bad: any[] = [
      { from: 'scripts' }, { from: 'home' }, { source: 'exec' }, { source: 'scripts' }, { from: undefined },
      { program: 3 }, { program: '' }, { program: '12345678901' }, { program: 'web' }, { program: '3a' }, { program: ' 3' }, { program: '-3' }, { program: '3.0' }, { program: null },
      { port: 0 }, { port: 65536 }, { port: 8000.5 }, { port: '8000' }, { port: -1 }, { port: NaN }, { port: Infinity }, { port: true },
      { realm: 'global' }, { realm: REALM.toUpperCase() }, { realm: 'all' }, { realm: undefined },
      { computer: { projectId: PID } }, { computer: { projectId: 'x', containerId: CID } }, { computer: null },
      { computer: { projectId: PID, containerId: 'c0ffee000000000000000c02' } }, { computer: { projectId: 'abcdef000000000000000002', containerId: CID } },
      { script: 'a.ts' }, { execId: '1' }, { severity: 'failed' }, { window: '1h' }, { extra: 1 },
    ];
    for (const b of bad) expect(deep(D.handoff({ ...ok, ...b }, ctx)), JSON.stringify(b)).toEqual({ error: 'reopen' });
    expect(deep(D.handoff(ok, { ...ctx, computers: [] }))).toEqual({ error: 'reopen' });
    expect(deep(D.handoff(ok, { ...ctx, realm: 'global' }))).toEqual({ error: 'reopen' });
    // the Scripts hand-off is unchanged and still refuses a programs key it does not know
    const sc = { source: 'exec', from: 'scripts', computer: { projectId: PID, containerId: CID }, realm: REALM, script: 'jobs/a.ts', execId: '1' };
    expect(deep(D.handoff(sc, ctx))).toMatchObject({ source: 'scripts', script: 'jobs/a.ts' });
    expect(deep(D.handoff({ ...sc, from: 'programs' }, ctx))).toEqual({ error: 'reopen' });
  });

  test('realm all: accepted only while the Hub is on all realms too; every other check still applies', () => {
    const all = { realm: 'all', computers: [{ projectId: PID, containerId: CID }] };
    expect(deep(D.handoff({ ...ok, realm: 'all' }, all))).toEqual({ source: 'programs', computer: { projectId: PID, containerId: CID }, realm: 'all', program: '3', port: 8001 });
    expect(deep(D.handoff({ ...ok, realm: 'all', port: undefined }, all))).toMatchObject({ realm: 'all', port: null });
    // the Hub on one realm, the hand-off on all (and the reverse): refused
    expect(deep(D.handoff({ ...ok, realm: 'all' }, ctx))).toEqual({ error: 'reopen' });
    expect(deep(D.handoff(ok, all))).toEqual({ error: 'reopen' });
    expect(deep(D.handoff({ ...ok, realm: 'global' }, all))).toEqual({ error: 'reopen' });
    for (const r of ['ALL', 'All', ' all', 'all ', '__all__', '*', '', null, undefined]) {
      expect(deep(D.handoff({ ...ok, realm: r }, all)), String(r)).toEqual({ error: 'reopen' });
      expect(deep(D.handoff({ ...ok, realm: 'all' }, { ...all, realm: r })), 'ctx ' + String(r)).toEqual({ error: 'reopen' });
    }
    // the rest of the record is checked exactly as for one realm
    const bad: any[] = [
      { computer: { projectId: PID, containerId: 'c0ffee000000000000000c02' } }, { computer: null }, { program: '12345678901' }, { program: 'web' },
      { port: 0 }, { port: 65536 }, { port: '8000' }, { source: 'exec' }, { extra: 1 }, { script: 'a.ts' },
    ];
    for (const b of bad) expect(deep(D.handoff({ ...ok, realm: 'all', ...b }, all)), JSON.stringify(b)).toEqual({ error: 'reopen' });
    expect(deep(D.handoff({ ...ok, realm: 'all' }, { ...all, computers: [] }))).toEqual({ error: 'reopen' });
    // the Scripts hand-off does not gain realm all
    const sc = { source: 'exec', from: 'scripts', computer: { projectId: PID, containerId: CID }, realm: 'all', script: 'jobs/a.ts', execId: '1' };
    expect(deep(D.handoff(sc, all))).toEqual({ error: 'reopen' });
  });

  test('a share link names the Programs source; the all-realms link (#c=…&s=programs) opens it with no other state', () => {
    expect(deep(D.parseLink('#c=' + CID + '&s=programs'))).toEqual({ computer: CID, source: 'programs' });
    expect(D.linkFor({ computer: CID, source: 'programs' })).toBe('#c=' + CID + '&s=programs');
    expect(deep(D.parseLink('#c=' + CID + '&s=programs&p=3&port=8001'))).toEqual({ computer: CID, source: 'programs' });
  });
});


// Kept as is: hub_logs_v1 and the Scripts/Programs navigation hand-off keep the field computer.containerId. A record the
// build before the rename wrote (this JSON text is its serialized form) is accepted, not sent to REOPEN.
describe('hand-off records keep computer.containerId', () => {
  const PID = 'abcdef000000000000000001', REALM = '0123456789abcdef01234567';
  const golden = `{"source":"scripts","computer":{"projectId":"${PID}","containerId":"${CID}"},"realm":"${REALM}","script":"default/1/jobs/nightly.ts","execId":"1","severity":"failed","executionId":"exec_01","window":"24h"}`;
  const ctx = { realm: REALM, computers: [{ projectId: PID, containerId: CID }] };

  test('a stored Scripts hand-off written by the current build restores whole', () => {
    const r = D.restore(JSON.parse(golden), ctx);
    expect(r).not.toBeNull();
    expect(deep(r)).toMatchObject({ source: 'scripts', computer: { projectId: PID, containerId: CID }, realm: REALM, script: 'default/1/jobs/nightly.ts', severity: 'failed' });
  });
  test('a hand-off with the id under another name is not accepted: the stored key is containerId and nothing else', () => {
    const renamed = JSON.parse(golden.replace('"containerId"', '"computerId"'));
    expect(D.restore(renamed, ctx)).toBeNull();
  });
  test('a Programs hand-off keeps the same key', () => {
    const rec = { from: 'programs', source: 'programs', computer: JSON.parse(golden).computer, realm: REALM, program: '3', port: 8001 };
    expect(deep(D.handoff(rec, ctx))).toMatchObject({ source: 'programs', computer: { projectId: PID, containerId: CID }, program: '3', port: 8001 });
  });
});
