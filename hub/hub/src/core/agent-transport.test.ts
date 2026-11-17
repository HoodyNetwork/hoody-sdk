// The core transport the AI tab's agent writes need. One row per compare-and-swap mechanism
// (each proving a stale write is refused and never read as pending), the caller-header allowlist (X-Hoody-Cwd only where
// declared, Config-Dir never), the approver-lease header (now only a spent lease ticket's value: ticket.test.ts), DELETE bodies, the
// process-wide class (/pause) and the typed refusals (daemon_paused). Routes here have the shapes of the agent's spec.
import { describe, expect, it } from 'vitest';
import { api, outcomeOf, unknownOutcome } from './api';
import { errorInfo } from './errors';
import { bump } from './ctx';
import { cwdHeader } from './kit';
import { defineRoute, type RouteSpec } from './routes';
import { AGENT, boot, calls, onFetch, R1 } from './test/env';

const TAG = '"7"';
const S = '/sessions/:id';

type Row = {
  name: string;
  spec: RouteSpec;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  stale: { status: number; body: Record<string, unknown> };
  /** What the call must carry to be a conditional write. */
  token: 'etag' | 'body' | 'none';
  missing?: Record<string, unknown>;
  wire: (c: (typeof calls)[number]) => void;
};

const body409 = (code: string, details: Record<string, unknown> = {}) => ({ status: 409, body: { code, message: 'x', details } });
const inBody = (k: string) => (c: (typeof calls)[number]) => expect(c.body).toHaveProperty(k);

const ROWS: Row[] = [
  { name: 'setSessionApproval', spec: { method: 'PUT', path: `${S}/approval`, scope: 'agent', body: ['mode', 'locked'], cas: { via: 'etag' } },
    params: { id: 's1' }, body: { mode: 'always' }, stale: { status: 412, body: { code: 'precondition_failed' } }, token: 'etag',
    wire: (c) => expect(c.headers['if-match']).toBe(TAG) },
  { name: 'setSessionApprovalRule', spec: { method: 'PUT', path: `${S}/approval/rules/:tool`, scope: 'agent', body: ['decision'], cas: { via: 'etag' } },
    params: { id: 's1', tool: 'bash' }, body: { decision: 'allow' }, stale: { status: 412, body: { code: 'precondition_failed' } }, token: 'etag',
    wire: (c) => expect(c.headers['if-match']).toBe(TAG) },
  { name: 'deleteSessionApprovalRule', spec: { method: 'DELETE', path: `${S}/approval/rules/:tool`, scope: 'agent', cas: { via: 'etag' } },
    params: { id: 's1', tool: 'bash' }, stale: { status: 412, body: { code: 'precondition_failed' } }, token: 'etag',
    wire: (c) => expect(c.headers['if-match']).toBe(TAG) },
  { name: 'putAgentSource', spec: { method: 'PUT', path: '/agents/:name/source', scope: 'agent', body: ['content', 'expected_revision'], cas: { via: 'body', keys: ['expected_revision'] }, refuses: ['revision_conflict'] },
    params: { name: 'general' }, body: { content: 'x', expected_revision: 'r5' }, missing: { content: 'x' },
    stale: body409('revision_conflict', { current_revision: 'r6' }), token: 'body', wire: inBody('expected_revision') },
  { name: 'putSkillSource', spec: { method: 'PUT', path: '/skills/source', scope: 'agent', body: ['root_dir', 'rel_dir', 'content', 'base_gen'], cas: { via: 'body', keys: ['base_gen'] }, refuses: ['revision_conflict'] },
    body: { root_dir: '/a', rel_dir: 'b', content: 'x', base_gen: 'g1' }, missing: { root_dir: '/a', rel_dir: 'b', content: 'x' },
    stale: body409('revision_conflict', { current_gen: 'g2' }), token: 'body', wire: inBody('base_gen') },
  { name: 'putWorkflow (200 tool envelope)', spec: { method: 'PUT', path: '/workflows/:name', scope: 'agent', body: ['definition', 'expected_revision', 'expected_absent'], cas: { via: 'body', keys: ['expected_revision'] }, refuses: ['revision_conflict'], envelope: true },
    params: { name: 'lint' }, body: { definition: 'd', expected_revision: 'w3' }, missing: { definition: 'd' },
    stale: { status: 200, body: { is_error: true, code: 'revision_conflict', output: 'modified since you loaded it' } }, token: 'body', wire: inBody('expected_revision') },
  { name: 'setWorkflowSummary', spec: { method: 'PUT', path: '/workflows/:name/summary', scope: 'agent', body: ['summary', 'expected_revision'], cas: { via: 'body', keys: ['expected_revision'] }, refuses: ['revision_conflict'] },
    params: { name: 'lint' }, body: { summary: 's', expected_revision: 'w3' }, missing: { summary: 's' },
    stale: body409('revision_conflict', { current_revision: 'w4' }), token: 'body', wire: inBody('expected_revision') },
  { name: 'setHookRules (revision + nonce)', spec: { method: 'POST', path: '/hooks/rules', scope: 'agent', body: ['session_id', 'nonce', 'scope', 'rules', 'expected_revision'], cas: { via: 'body', keys: ['nonce', 'expected_revision'] }, refuses: ['revision_conflict'] },
    body: { session_id: 's1', nonce: 'n1', rules: [], expected_revision: 'h1' }, missing: { session_id: 's1', nonce: 'n1', rules: [] },
    stale: body409('revision_conflict'), token: 'body', wire: inBody('nonce') },
  { name: 'upsertHook (nonce)', spec: { method: 'PUT', path: '/hooks', scope: 'agent', body: ['session_id', 'nonce', 'event', 'command'], cas: { via: 'body', keys: ['nonce'] }, refuses: ['write_intent_invalid'] },
    body: { session_id: 's1', nonce: 'n1', event: 'PreToolUse', command: 'c' }, missing: { session_id: 's1', event: 'PreToolUse', command: 'c' },
    stale: body409('write_intent_invalid'), token: 'body', wire: inBody('nonce') },
  { name: 'toggleHook (nonce)', spec: { method: 'POST', path: '/hooks/toggle', scope: 'agent', body: ['session_id', 'nonce', 'enabled'], cas: { via: 'body', keys: ['nonce'] }, refuses: ['write_intent_invalid'] },
    body: { session_id: 's1', nonce: 'n1', enabled: true }, missing: { session_id: 's1', enabled: true },
    stale: body409('write_intent_invalid'), token: 'body', wire: inBody('nonce') },
  { name: 'deleteHook (DELETE body, nonce)', spec: { method: 'DELETE', path: '/hooks', scope: 'agent', body: ['session_id', 'nonce', 'event'], deleteBody: true, cas: { via: 'body', keys: ['nonce'] }, refuses: ['write_intent_invalid'] },
    body: { session_id: 's1', nonce: 'n1', event: 'PreToolUse' }, missing: { session_id: 's1', event: 'PreToolUse' },
    stale: body409('write_intent_invalid'), token: 'body', wire: inBody('nonce') },
  { name: 'disableAllHooks (nonce)', spec: { method: 'POST', path: '/hooks/disable-all', scope: 'agent', body: ['session_id', 'nonce', 'value'], cas: { via: 'body', keys: ['nonce'] }, refuses: ['write_intent_invalid'] },
    body: { session_id: 's1', nonce: 'n1', value: true }, missing: { session_id: 's1', value: true },
    stale: body409('write_intent_invalid'), token: 'body', wire: inBody('nonce') },
  { name: 'ackHookTrust (reviewed hash)', spec: { method: 'POST', path: '/hooks/trust/ack', scope: 'agent', body: ['session_id', 'hash', 'high_risk'], cas: { via: 'body', keys: ['hash'] } },
    body: { session_id: 's1', hash: 'abc' }, missing: { session_id: 's1' }, stale: body409('config_changed'), token: 'body', wire: inBody('hash') },
  { name: 'upsertMCPServer (nonce + expect_hash)', spec: { method: 'PUT', path: '/mcp/servers', scope: 'agent', body: ['session_id', 'nonce', 'expect_hash', 'server'], cas: { via: 'body', keys: ['nonce', 'expect_hash'] }, refuses: ['write_intent_invalid'] },
    body: { session_id: 's1', nonce: 'n1', expect_hash: 'h', server: {} }, missing: { session_id: 's1', nonce: 'n1', server: {} },
    stale: body409('write_intent_invalid'), token: 'body', wire: inBody('expect_hash') },
  { name: 'deleteMCPServer (DELETE body)', spec: { method: 'DELETE', path: '/mcp/servers', scope: 'agent', body: ['session_id', 'nonce', 'expect_hash', 'name'], deleteBody: true, cas: { via: 'body', keys: ['nonce', 'expect_hash'] }, refuses: ['write_intent_invalid'] },
    body: { session_id: 's1', nonce: 'n1', expect_hash: 'h', name: 'm' }, missing: { session_id: 's1', name: 'm' },
    stale: body409('write_intent_invalid'), token: 'body', wire: inBody('nonce') },
  { name: 'deleteMemoryProject (DELETE body, nonce)', spec: { method: 'DELETE', path: '/memory/projects/:project', scope: 'agent', body: ['nonce', 'reason', 'expect_realm'], deleteBody: true, cas: { via: 'body', keys: ['nonce'] }, refuses: ['write_intent_invalid'] },
    params: { project: 'p' }, body: { nonce: 'n1', reason: 'r' }, missing: { reason: 'r' }, stale: body409('write_intent_invalid'), token: 'body', wire: inBody('nonce') },
  { name: 'deleteLoop (DELETE body)', spec: { method: 'DELETE', path: `${S}/loops/:loopId`, scope: 'agent', body: [], deleteBody: true },
    params: { id: 's1', loopId: 'l1' }, body: {}, stale: { status: 404, body: { code: 'not_found' } }, token: 'none', wire: (c) => expect(c.body).toEqual({}) },
  { name: 'patchSettings (shallow merge)', spec: { method: 'PATCH', path: '/settings', scope: 'agent', realm: 'none', body: ['patch'] },
    body: { patch: { ui: {} } }, stale: { status: 403, body: { code: 'settings_key_protected' } }, token: 'none', wire: inBody('patch') },
];

const call = (r: Row, extra: Record<string, unknown> = {}) => {
  const route = defineRoute<unknown, Record<string, unknown>>(r.spec);
  return api(route, { params: r.params, body: r.body, ...(r.token === 'etag' ? { ifMatch: TAG } : {}), ...extra } as never);
};


describe('every compare-and-swap row: a stale write is refused, never pending, never unconditional', () => {
  for (const r of ROWS) {
    describe(r.name, () => {
      it('carries its token on the wire, to the agent, once', async () => {
        boot({ realm: R1 });
        onFetch(() => ({ status: 200, body: { ok: true } }));
        await call(r);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url.startsWith(AGENT)).toBe(true);
        r.wire(calls[0]!);
      });
      if (r.token !== 'none') {
        it('without its token the write is refused unsent (CAS_REQUIRED), so no unconditional write exists', async () => {
          boot({ realm: R1 });
          const route = defineRoute<unknown, Record<string, unknown>>(r.spec);
          const input = r.token === 'etag' ? { params: r.params, body: r.body } : { params: r.params, body: r.missing };
          await expect(api(route, input as never)).rejects.toMatchObject({ notSent: true, code: 'CAS_REQUIRED' });
          expect(calls).toHaveLength(0);
        });
      }
      it('the stale answer is a definite refusal: failed, sent once, its code and details reach the caller', async () => {
        boot({ realm: R1 });
        onFetch(() => r.stale);
        const e = await call(r).then(() => null, (x: unknown) => x as Record<string, unknown>);
        expect(e).not.toBeNull();
        expect(calls).toHaveLength(1);
        expect(outcomeOf(e, true)).toBe('failed');
        expect(unknownOutcome(e)).toBe(false);
        expect((e as { pending?: boolean }).pending).toBeFalsy();
        const code = r.stale.body.code as string | undefined;
        expect(e!.code).toBe(code);
        const details = (r.stale.body.details ?? null) as Record<string, unknown> | null;
        if (details) expect(e!.details).toMatchObject(details);
      });
    });
  }
  it('the table holds 18 write rows (setAgentTools carries no token: it sends the whole list and is read back)', () => {
    expect(ROWS.length).toBe(18);
  });
});

describe('route declarations', () => {
  const ok = (s: RouteSpec) => defineRoute(s);
  it('cas only on an agent change; body keys must be declared body keys; the etag form takes nothing else', () => {
    expect(() => ok({ method: 'GET', path: '/x', scope: 'agent', cas: { via: 'etag' } })).toThrow(/ROUTE_INVALID: cas/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'realm', cas: { via: 'etag' } })).toThrow(/ROUTE_INVALID: cas/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', body: ['a'], cas: { via: 'body', keys: ['b'] } })).toThrow(/ROUTE_INVALID: cas keys/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', cas: { via: 'body', keys: ['a'] } })).toThrow(/ROUTE_INVALID: cas keys/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', body: ['a'], cas: { via: 'body', keys: [] } })).toThrow(/ROUTE_INVALID: cas keys/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', cas: { via: 'what' } as never })).toThrow(/ROUTE_INVALID: cas/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', cas: { via: 'etag', keys: ['a'] } as never })).toThrow(/ROUTE_INVALID: cas/);
    expect(ok({ method: 'PUT', path: '/x', scope: 'agent', cas: { via: 'etag' } }).cas).toEqual({ via: 'etag' });
  });
  it('an agent DELETE takes a body only when it declares deleteBody; kit and base are unchanged', () => {
    expect(() => ok({ method: 'DELETE', path: '/x', scope: 'agent', body: ['a'] })).toThrow(/body on DELETE/);
    expect(ok({ method: 'DELETE', path: '/x', scope: 'agent', body: ['a'], deleteBody: true }).body).toEqual(['a']);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', deleteBody: true })).toThrow(/ROUTE_INVALID: deleteBody/);
    expect(() => ok({ method: 'DELETE', path: '/x', scope: 'kit', kit: 'egress', index: 1, body: ['a'], deleteBody: true })).toThrow(/ROUTE_INVALID: deleteBody/);
  });
  it('refuses, envelope, readsEtag, cwd and lease are agent-only and strict', () => {
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'realm', refuses: ['a_b'] })).toThrow(/ROUTE_INVALID: refuses/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', refuses: [] })).toThrow(/ROUTE_INVALID: refuses/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', refuses: ['A-1'] })).toThrow(/ROUTE_INVALID: refuses/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', envelope: true })).toThrow(/ROUTE_INVALID: envelope/);
    expect(() => ok({ method: 'PUT', path: '/x', scope: 'agent', readsEtag: true })).toThrow(/ROUTE_INVALID: readsEtag/);
    expect(() => ok({ method: 'GET', path: '/x', scope: 'realm', readsEtag: true })).toThrow(/ROUTE_INVALID: readsEtag/);
    expect(() => ok({ method: 'GET', path: '/x', scope: 'realm', cwd: true })).toThrow(/ROUTE_INVALID: cwd/);
    expect(() => ok({ method: 'GET', path: '/x', scope: 'kit', kit: 'egress', index: 1, cwd: true })).toThrow(/ROUTE_INVALID: cwd/);
    expect(() => ok({ method: 'GET', path: '/x', scope: 'agent', cwd: false as unknown as true })).toThrow(/ROUTE_INVALID: cwd/);
  });
  it('a refuses code is also a declared code of the route (a secret rejection keeps it)', () => {
    expect(ok({ method: 'PUT', path: '/x', scope: 'agent', codes: ['a_b'], refuses: ['revision_conflict'] }).codes).toEqual(['a_b', 'revision_conflict']);
  });
});

describe('X-Hoody-Cwd: only where the route declares it; Config-Dir and the rest never', () => {
  const list = defineRoute<unknown>({ method: 'GET', path: '/hooks/rules', scope: 'agent', cwd: true });
  const plain = defineRoute<unknown>({ method: 'GET', path: '/sessions', scope: 'agent' });
  it('a declared route sends it, the folder as its UTF-8 bytes', async () => {
    boot({ realm: R1 });
    await api(list, { cwd: '/srv/Ünï/ö' });
    const sent = calls[0]!.headers['x-hoody-cwd']!;
    expect([...sent].map((ch) => ch.charCodeAt(0))).toEqual([...new TextEncoder().encode('/srv/Ünï/ö')]);
    expect(new TextDecoder().decode(Uint8Array.from([...sent].map((ch) => ch.charCodeAt(0))))).toBe('/srv/Ünï/ö');
  });
  it('no cwd given: no header', async () => {
    boot({ realm: R1 });
    await api(list, {});
    expect(calls[0]!.headers['x-hoody-cwd']).toBeUndefined();
  });
  it('a route that declares none refuses a cwd unsent', async () => {
    boot({ realm: R1 });
    await expect(api(plain, { cwd: '/srv' })).rejects.toMatchObject({ notSent: true, code: 'HEADER_NOT_ALLOWED' });
    expect(calls).toHaveLength(0);
  });
  it('only an absolute well-formed path: relative, controls, edge spaces, lone surrogates, over 4096 bytes are refused', async () => {
    boot({ realm: R1 });
    for (const bad of ['srv', '', '/a\nb', '/a\u0000', ' /a', '/a ', '/a\uD800', '\uDC00', '/' + 'x'.repeat(4096), 5 as never]) {
      await expect(api(list, { cwd: bad })).rejects.toMatchObject({ notSent: true, code: 'HEADER_NOT_ALLOWED' });
    }
    expect(calls).toHaveLength(0);
    expect(cwdHeader('/' + 'x'.repeat(4095))).not.toBeNull();
    expect(cwdHeader('/a b')).toBe('/a b');
  });
  it('Config-Dir, Cwd or any X-Hoody header a caller tries to pass is never sent', async () => {
    boot({ realm: R1 });
    await api(list, { cwd: '/srv', headers: { 'X-Hoody-Config-Dir': '/x', 'X-Hoody-Cwd': '/evil', 'X-Hoody-Realm': 'z' } } as never);
    const names = Object.keys(calls[0]!.headers).filter((n) => n.startsWith('x-hoody'));
    expect(names).toEqual(['x-hoody-cwd']);
    expect(calls[0]!.headers['x-hoody-cwd']).toBe('/srv');
    expect(calls[0]!.url).not.toMatch(/config/i);
  });
});

describe('the process-wide class (/pause)', () => {
  it('a /pause route takes no realm and no cwd: declared so, and no realm= or header goes out', async () => {
    expect(defineRoute({ method: 'GET', path: '/pause', scope: 'agent' }).realm).toBe('none');
    expect(() => defineRoute({ method: 'GET', path: '/pause', scope: 'agent', realm: 'realm' })).toThrow(/process-wide/);
    expect(() => defineRoute({ method: 'GET', path: '/pause', scope: 'agent', cwd: true })).toThrow(/ROUTE_INVALID: cwd/);
    boot({ realm: R1 });
    const put = defineRoute<unknown, { paused: boolean }>({ method: 'PUT', path: '/pause', scope: 'agent', body: ['paused'] });
    await api(put, { body: { paused: true }, realm: R1 });
    expect(calls[0]!.url).toBe(`${AGENT}/pause`);
    expect(Object.keys(calls[0]!.headers).filter((n) => n.startsWith('x-hoody'))).toEqual([]);
    await expect(api(put, { body: { paused: true }, cwd: '/srv' })).rejects.toMatchObject({ code: 'HEADER_NOT_ALLOWED', notSent: true });
  });
});

describe('typed refusals: daemon_paused, tool envelopes, ETags', () => {
  const gated = (extra: Partial<RouteSpec> = {}) => defineRoute<unknown>({ method: 'GET', path: '/workflows/:name', scope: 'agent', ...extra });
  it('503 daemon_paused with Retry-After: a listed refusal is notApplied and failed, with the wait; unlisted a 5xx stays unknown', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 503, body: { code: 'daemon_paused' }, headers: { 'retry-after': '7' } }));
    const w = defineRoute<unknown, { definition: string }>({ method: 'PUT', path: '/workflows/:name', scope: 'agent', body: ['definition'], refuses: ['daemon_paused'] });
    const e = await api(w, { params: { name: 'a' }, body: { definition: 'd' } }).then(() => null, (x: unknown) => x as Record<string, unknown>);
    expect(e).toMatchObject({ status: 503, code: 'daemon_paused', notApplied: true, retryAfterMs: 7000 });
    expect(outcomeOf(e, true)).toBe('failed');
    expect(errorInfo(e)).toMatchObject({ outcome: 'failed', code: 'daemon_paused', status: 503, retryAfterMs: 7000 });
    const u = defineRoute<unknown, { definition: string }>({ method: 'PUT', path: '/workflows/:name', scope: 'agent', body: ['definition'] });
    const e2 = await api(u, { params: { name: 'a' }, body: { definition: 'd' } }).then(() => null, (x: unknown) => x);
    expect(outcomeOf(e2, true)).toBe('pending');
  });
  it('the same code from a different 5xx route that does not list it is not trusted', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 503, body: { code: 'revision_conflict' } }));
    const w = defineRoute<unknown, { a: string }>({ method: 'PUT', path: '/y', scope: 'agent', body: ['a'], refuses: ['daemon_paused'] });
    const e = await api(w, { body: { a: 'x' } }).then(() => null, (x: unknown) => x);
    expect(outcomeOf(e, true)).toBe('pending');
  });
  it('a tool envelope: is_error with a listed code is a refusal; another error code may have run (pending); a clean one resolves', async () => {
    const w = defineRoute<unknown, { definition: string; expected_revision: string }>({ method: 'PUT', path: '/workflows/:name', scope: 'agent', body: ['definition', 'expected_revision'], cas: { via: 'body', keys: ['expected_revision'] }, refuses: ['revision_conflict'], envelope: true });
    const go = () => api(w, { params: { name: 'a' }, body: { definition: 'd', expected_revision: 'r' } });
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { is_error: true, code: 'revision_conflict', output: 'x' } }));
    const e = await go().then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ status: 200, code: 'revision_conflict', notApplied: true });
    expect(outcomeOf(e, true)).toBe('failed');
    onFetch(() => ({ status: 200, body: { is_error: true, code: 'workflow_invalid', output: 'x' } }));
    expect(outcomeOf(await go().then(() => null, (x: unknown) => x), true)).toBe('pending');
    onFetch(() => ({ status: 200, body: { is_error: true, output: 'x' } }));
    expect(await go().then(() => null, (x: unknown) => x)).toMatchObject({ code: 'TOOL_ERROR', pending: true });
    onFetch(() => ({ status: 200, body: { is_error: false, output: 'ok' } }));
    await expect(go()).resolves.toMatchObject({ output: 'ok' });
    // Without envelope:true an is_error field is just data.
    onFetch(() => ({ status: 200, body: { is_error: true, code: 'revision_conflict' } }));
    await expect(api(gated(), { params: { name: 'a' } })).resolves.toMatchObject({ is_error: true });
  });
  it('a secret route keeps the refuses code on its rebuilt rejection, and the notApplied flag', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 409, body: { code: 'revision_conflict', message: 'secret echo' } }));
    const w = defineRoute<unknown, { content: string }>({ method: 'PUT', path: '/s', scope: 'agent', body: ['content'], secret: true, refuses: ['revision_conflict'] });
    const e = await api(w, { body: { content: 'x' } }).then(() => null, (x: unknown) => x as Record<string, unknown>);
    expect(e).toMatchObject({ code: 'revision_conflict', notApplied: true });
    expect(JSON.stringify(e)).not.toContain('secret echo');
  });
  it('readsEtag: the read hands over its strong ETag; a cas etag write hands over the next one; undeclared agent routes still refuse onEtag', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: {}, headers: { etag: TAG } }));
    const got: Array<string | null> = [];
    await api(defineRoute<unknown>({ method: 'GET', path: `${S}/approval`, scope: 'agent', readsEtag: true }), { params: { id: 's' }, onEtag: (t) => { got.push(t); } });
    onFetch(() => ({ status: 200, body: {}, headers: { etag: '"8"' } }));
    await api(defineRoute<unknown>({ method: 'PUT', path: `${S}/approval`, scope: 'agent', cas: { via: 'etag' } }), { params: { id: 's' }, ifMatch: TAG, onEtag: (t) => { got.push(t); } });
    expect(got).toEqual([TAG, '"8"']);
    const n = calls.length;
    await expect(api(defineRoute<unknown>({ method: 'GET', path: '/sessions', scope: 'agent' }), { onEtag: () => undefined })).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    expect(calls).toHaveLength(n);
  });
  it('a cas etag write takes the quoted strong ETag only: weak, unquoted, * and lists are refused unsent', async () => {
    boot({ realm: R1 });
    const put = defineRoute<unknown>({ method: 'PUT', path: `${S}/approval`, scope: 'agent', cas: { via: 'etag' } });
    for (const v of ['W/"1"', '7', '*', '"a","b"', '"x"\r\nX-Evil: 1', '']) {
      await expect(api(put, { params: { id: 's' }, ifMatch: v })).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
    }
    await expect(api(put, { params: { id: 's' } })).rejects.toMatchObject({ notSent: true, code: 'CAS_REQUIRED' });
    expect(calls).toHaveLength(0);
  });
  it('a route without a cas etag refuses any ifMatch (agent routes included)', async () => {
    boot({ realm: R1 });
    await expect(api(defineRoute({ method: 'GET', path: '/sessions', scope: 'agent' }), { ifMatch: TAG })).rejects.toMatchObject({ notSent: true, code: 'IF_MATCH_INVALID' });
  });
  it('errorInfo shows core\'s new fixed codes and still drops an unknown one', () => {
    for (const code of ['CAS_REQUIRED', 'daemon_paused', 'TOOL_ERROR']) expect(errorInfo({ code, status: 503 }).code).toBe(code);
    expect(errorInfo({ code: 'made_up_code_zzz', status: 503 }).code).toBeNull();
  });
});

describe('the agent\'s proof of non-application survives a context change at answer time', () => {
  const w = () => defineRoute<unknown, { definition: string; expected_revision: string }>({ method: 'PUT', path: '/workflows/:name', scope: 'agent', body: ['definition', 'expected_revision'], cas: { via: 'body', keys: ['expected_revision'] }, refuses: ['revision_conflict', 'daemon_paused'], envelope: true });
  // The context dies while the answer's body is being read: the answer is complete, nothing aborted it.
  async function answeredAfterBump(reply: { status: number; body: Record<string, unknown>; headers?: Record<string, string> }) {
    boot({ realm: R1 });
    onFetch(() => reply);
    const real = globalThis.fetch;
    globalThis.fetch = (async (u: string, i?: RequestInit) => {
      const r = await real(u, i);
      const text = await r.text();
      return new Response(new ReadableStream({ pull(c) { bump('switch'); c.enqueue(new TextEncoder().encode(text)); c.close(); } }), { status: r.status, headers: r.headers });
    }) as typeof fetch;
    try {
      return await api(w(), { params: { name: 'a' }, body: { definition: 'd', expected_revision: 'r1' } }).then(() => null, (x: unknown) => x as Record<string, unknown>);
    } finally { globalThis.fetch = real; }
  }
  it('409 revision_conflict: failed, notApplied, its code kept', async () => {
    const e = await answeredAfterBump({ status: 409, body: { code: 'revision_conflict', message: 'x', details: {} } });
    expect(e).toMatchObject({ code: 'revision_conflict', notApplied: true });
    expect(outcomeOf(e, true)).toBe('failed');
    expect(unknownOutcome(e)).toBe(false);
  });
  it('503 daemon_paused: failed, notApplied', async () => {
    const e = await answeredAfterBump({ status: 503, body: { code: 'daemon_paused' }, headers: { 'retry-after': '3' } });
    expect(e).toMatchObject({ code: 'daemon_paused', notApplied: true });
    expect(outcomeOf(e, true)).toBe('failed');
  });
  it('200 is_error with a listed code: failed, notApplied', async () => {
    const e = await answeredAfterBump({ status: 200, body: { is_error: true, code: 'revision_conflict', output: 'moved' } });
    expect(e).toMatchObject({ code: 'revision_conflict', notApplied: true });
    expect(outcomeOf(e, true)).toBe('failed');
    expect(unknownOutcome(e)).toBe(false);
  });
  it('an unlisted code, a clean answer or a 200 error with another code after the same change stays pending', async () => {
    for (const reply of [{ status: 409, body: { code: 'other', message: 'x', details: {} } }, { status: 200, body: { is_error: true, code: 'boom' } }, { status: 200, body: { ok: true } }]) {
      const e = await answeredAfterBump(reply);
      expect(outcomeOf(e, true)).toBe('pending');
    }
  });
});

describe('a numeric CAS token is a positive generation: 0 is the agent\'s "save unconditionally"', () => {
  const s = () => defineRoute<unknown, { content: string; base_gen: number }>({ method: 'PUT', path: '/skills/source', scope: 'agent', body: ['content', 'base_gen'], cas: { via: 'body', keys: ['base_gen'] } });
  it('0, negatives, fractions and unsafe integers are refused unsent (CAS_REQUIRED); 1 and above go', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { ok: true } }));
    for (const bad of [0, -1, 1.5, 2 ** 53]) {
      const e = await api(s(), { body: { content: 'c', base_gen: bad } }).then(() => null, (x: unknown) => x as Record<string, unknown>);
      expect(e, String(bad)).toMatchObject({ code: 'CAS_REQUIRED' });
    }
    expect(calls).toHaveLength(0);
    await api(s(), { body: { content: 'c', base_gen: 1 } });
    expect(calls).toHaveLength(1);
  });
});
