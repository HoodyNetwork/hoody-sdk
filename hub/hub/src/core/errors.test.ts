// errorInfo: the allow-list (extended by core).
import { afterEach, describe, expect, it } from 'vitest';
import { errorInfo, errorPage, isErrorInfo, setPageResolver } from './errors';
import { defineRoute } from './routes';
import { SourceError } from './source';
import * as genModule from './error-codes.gen';
import * as traceIdModule from './trace-id';
import { routeLabel } from './trace-id';
import { ipv4Problem } from './ipv4';
import './run-open/run-open-core.js';

// The routes these cases name, declared as a page's routes are: routeOf keeps only labels defineRoute declared.
for (const [method, path] of [
  ['POST', '/projects/:id/ssh-keys'], ['POST', '/a/:id'], ['PATCH', '/users/:id'], ['GET', '/'], ['POST', '/computers/:id/start'],
  ['DELETE', '/api/v1/a.b~c@d-e_f/:keyName'], ['POST', '/a'], ['PATCH', '/a/:id'], ['POST', '/projects'], ['GET', '/projects'], ['GET', '/projects/:id'],
] as const) defineRoute({ method, path, scope: 'base' });
defineRoute({ method: 'POST', path: '/f0c/declared-codes', scope: 'base', codes: ['ERRDETAILS_DECLARED_ONLY'] });

const now = new Date('2026-10-24T14:00:00Z');

describe('errorInfo (allow-list)', () => {
  it('keeps only the allowed facts, never data, details, bodies, headers, tokens or queries', () => {
    const junk = {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Name is required',
      traceId: '0f8c1e2d-3b4a-4c5d-8e9f-a1b2c3d4e5f6',
      route: 'POST /projects/{id}/ssh-keys',
      data: { token: 'eyJhbGciOiJIUzI1NiJ9.secret.sig', key: 'ssh-ed25519 AAAA' },
      details: { password: 'hunter2' },
      body: '{"access_token":"abc"}',
      headers: { authorization: 'Bearer abc' },
      url: 'https://x/api?key=abc',
      kind: 'answered',
    };
    const info = errorInfo(junk, { page: 'keys', now });
    expect(Object.keys(info).sort()).toEqual(['at', 'code', 'message', 'outcome', 'page', 'perm', 'retryAfterMs', 'route', 'status', 'traceId']);
    expect(info).toEqual({
      outcome: 'failed',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: null,
      traceId: '0f8c1e2d-3b4a-4c5d-8e9f-a1b2c3d4e5f6',
      route: 'POST /projects/{id}/ssh-keys',
      at: '2026-10-24T14:00:00.000Z',
      page: 'keys',
      perm: null,
      retryAfterMs: null,
    });
    expect(JSON.stringify(info)).not.toMatch(/eyJ|hunter2|Bearer|access_token|key=|ssh-ed25519|Name is required/);
  });
  it('drops a trace id, route, code or page that is not of the expected shape', () => {
    const info = errorInfo(
      { status: 500, traceId: 'Bearer abc', route: 'GET /projects/64a0f?token=abc', code: 'has space', },
      { page: 'Keys?x=1', now },
    );
    expect(info.traceId).toBeNull();
    expect(info.route).toBeNull();
    expect(info.code).toBeNull();
    expect(info.page).toBeNull();
    // perm: only a leaf the Hub's permission table knows.
    expect(errorInfo({ status: 403, perm: 'computers.actions.restart?token=abc' }, { now }).perm).toBeNull();
    expect(errorInfo({ status: 403, perm: 'computers.actions.restart' }, { now }).perm).toBe('computers.actions.restart');
    expect(errorInfo({ traceId: '0123456789abcdef' }, { now }).traceId).toBe('0123456789abcdef');
    expect(errorInfo({ traceId: '0123456789abcde' }, { now }).traceId).toBeNull();
  });
  it('keeps a route only when defineRoute declared it: a filled path, a dot segment or an undeclared template is dropped', () => {
    expect(errorInfo({ route: 'GET /projects/{id}' }, { now }).route).toBe('GET /projects/{id}');
    for (const bad of ['GET /projects/0123456789abcdef01234567', 'GET /projects/REVIEW_SENT_VALUE', 'GET /undeclared/{id}', 'POST /projects/{id}', 'GET /.', 'GET /..', 'GET /a/../b', 'GET /projects/./x']) {
      expect(errorInfo({ route: bad }, { now }).route).toBeNull();
      expect(new SourceError('bad_request', null, 400, { route: bad }).route).toBeNull();
    }
  });
  it('registers a route label only through defineRoute: trace-id exports no registrar', () => {
    expect(Object.keys(traceIdModule).sort()).toEqual(['routeLabel', 'traceIdOf']);
    expect(errorInfo({ route: 'POST /f0c/declared-codes' }, { now }).route).toBe('POST /f0c/declared-codes');
    expect(errorInfo({ route: 'POST /f0c/never-declared' }, { now }).route).toBeNull();
  });
  it('keeps a code only when it is published, core\'s own or a declared route\'s: never an echoed value', () => {
    for (const c of ['VALIDATION_ERROR', 'realm_scope_unsupported', 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'in_progress', 'TOKEN_SESSION_REFUSED', 'CANCELLED', 'NETWORK', 'not_sent', 'bad_request', 'ERRDETAILS_DECLARED_ONLY']) {
      expect(errorInfo({ status: 400, code: c }, { now }).code).toBe(c);
    }
    for (const c of ['REVIEW_SENT_VALUE', 'my-sent-alias', 'hdy_abc123', 'Bearer', 'ERRDETAILS_NEVER_DECLARED']) {
      expect(errorInfo({ status: 409, code: c, route: 'POST /projects' }, { now }).code).toBeNull();
      expect(errorInfo(new SourceError('bad_request', c, 400), { now }).code).toBeNull();
    }
    // C9 reads the raw code before the filter: an unpublished code never turns a pending change into anything else
    expect(errorInfo({ status: 409, code: 'in_progress', route: 'POST /projects' }, { now }).outcome).toBe('pending');
    expect(errorInfo({ pending: true, status: 409, code: 'REVIEW_SENT_VALUE', route: 'POST /projects' }, { now })).toMatchObject({ outcome: 'pending', code: null });
  });
  it('C9: a SourceError that drops an undeclared change route still reads a change still running as pending', () => {
    for (const code of ['IDEMPOTENCY_REQUEST_IN_PROGRESS', 'SCRUB_FAILED']) {
      const se = new SourceError('server', code, code === 'SCRUB_FAILED' ? null : 409, { route: 'POST /undeclared/0123456789abcdef01234567' });
      expect(se.route).toBeNull();
      expect(errorInfo(se, { now })).toMatchObject({ outcome: 'pending', route: null });
      expect(JSON.stringify(errorInfo(se, { now }))).not.toContain('0123456789abcdef01234567');
    }
    expect(errorInfo(new SourceError('server', 'SCRUB_FAILED', null, { route: 'GET /undeclared/1' }), { now }).outcome).toBe('failed');
  });
  it('never keeps a message: an API answer can echo what was sent, and a copied rejection cannot prove whose words it holds', () => {
    expect(errorInfo({ status: 409, code: 'ALIAS_TAKEN', message: 'Alias "my-sent-alias" is already in use', route: 'POST /projects' }, { now }).message).toBeNull();
    expect(errorInfo({ status: 400, message: 'internal words' }, { now }).message).toBeNull(); // an Error sentAs() copied
    expect(errorInfo({ status: 403, notSent: true, message: 'Not allowed here' }, { now }).message).toBeNull(); // a framed refusal
    expect(errorInfo(Object.assign(Object.create(null), { status: 400, message: 'The API said so' }), { now }).message).toBeNull();
  });
  it('C9: pending stays pending whatever the status; a lost answer on a change is pending', () => {
    expect(errorInfo({ pending: true, status: 500 }, { now }).outcome).toBe('pending');
    expect(errorInfo({ kind: 'pending', status: 400, cancelled: true }, { now }).outcome).toBe('pending');
    expect(errorInfo({ status: 409, code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', route: 'POST /projects' }, { now }).outcome).toBe('pending');
    expect(errorInfo({ status: 409, code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', route: 'GET /projects' }, { now }).outcome).toBe('failed');
    // a change by its method, even when its route is not kept: still pending
    expect(errorInfo({ status: 409, code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', route: 'POST /undeclared/0123456789abcdef01234567' }, { now })).toMatchObject({ outcome: 'pending', route: null });
    expect(errorInfo({ status: 409, code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', route: 'DELETE /x?y=1' }, { now })).toMatchObject({ outcome: 'pending', route: null });
    expect(errorInfo({ status: 409, code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', route: 'GET /undeclared/1' }, { now }).outcome).toBe('failed');
  });
  it('names stale, not_sent and cancelled outcomes', () => {
    expect(errorInfo({ kind: 'stale', stale: true }, { now }).outcome).toBe('stale');
    expect(errorInfo({ kind: 'not_sent', notSent: true, code: 'TOKEN_SESSION_REFUSED' }, { now }).outcome).toBe('not_sent');
    // an API call blocked before sending by an unavailable refresh (shared.js refreshUnavailableError) keeps its reason in copied details
    expect(errorInfo({ notSent: true, code: 'REFRESH_UNAVAILABLE', status: 503 }, { now })).toMatchObject({ outcome: 'not_sent', code: 'REFRESH_UNAVAILABLE' });
    expect(errorInfo({ cancelled: true }, { now }).outcome).toBe('cancelled');
    // a cancel overrides a refusal or an undecided outcome only, never a decided stale or not_sent
    expect(errorInfo({ outcome: 'failed', cancelled: true }, { now }).outcome).toBe('cancelled');
    expect(errorInfo({ outcome: 'stale', cancelled: true }, { now }).outcome).toBe('stale');
    expect(errorInfo({ outcome: 'not_sent', cancelled: true }, { now }).outcome).toBe('not_sent');
  });
  it('turns retryAfter seconds into ms, and a non-answer into a null status', () => {
    expect(errorInfo({ status: 429, retryAfter: 3 }, { now }).retryAfterMs).toBe(3000);
    expect(errorInfo({ status: 0 }, { now }).status).toBeNull();
    expect(errorInfo(new TypeError('Failed to fetch'), { now })).toMatchObject({ outcome: 'failed', status: null, message: null });
    expect(errorInfo(undefined, { now })).toMatchObject({ outcome: 'failed', status: null, code: null });
  });
  it('passes an ErrorInfo through, and a look-alike is not one', () => {
    const info = errorInfo({ status: 404 }, { now });
    expect(isErrorInfo(info)).toBe(true);
    expect(errorInfo(info)).toBe(info);
    expect(isErrorInfo({ ...info })).toBe(false);
    expect(Object.isFrozen(info)).toBe(true);
  });
  it('reads the page from the first hash segment when none is given', () => {
    const before = window.location.hash;
    window.location.hash = '#/keys/ssh?filter=abc';
    try {
      expect(errorInfo({ status: 500 }, { now }).page).toBe('keys');
    } finally {
      window.location.hash = before;
    }
  });

  it('keeps an outcome a source or lock already decided; pending wins over a status or a cancel', () => {
    expect(errorInfo({ outcome: 'pending', status: 400, code: 'X', traceId: '0123456789abcdef0123abcd', route: 'POST /a/{id}' }, { now })).toMatchObject({ outcome: 'pending', status: 400, traceId: '0123456789abcdef0123abcd', route: 'POST /a/{id}' });
    expect(errorInfo({ outcome: 'pending', cancelled: true }, { now }).outcome).toBe('pending');
    expect(errorInfo({ outcome: 'not_sent', code: 'BUSY' }, { now }).outcome).toBe('not_sent');
    expect(errorInfo({ outcome: 'stale' }, { now }).outcome).toBe('stale');
    expect(errorInfo({ outcome: 'failed', status: 422 }, { now }).outcome).toBe('failed');
    expect(errorInfo({ outcome: 'done' }, { now }).outcome).toBe('failed'); // not an error outcome: never read as one
  });
  it("copies no Error's message (a SourceError's words are the Hub's)", () => {
    const se = new SourceError('bad_request', 'VALIDATION_ERROR', 400, { traceId: '0123456789abcdef0123abcd', route: 'PATCH /users/{id}' });
    expect(errorInfo(se, { now })).toMatchObject({ outcome: 'failed', status: 400, code: 'VALIDATION_ERROR', message: null, traceId: '0123456789abcdef0123abcd', route: 'PATCH /users/{id}' });
    const thrown = Object.assign(new Error('internal words'), { status: 500 });
    expect(errorInfo(thrown, { now }).message).toBeNull();
  });
  it("accepts exactly routeLabel's shape: the root, :name as {name}, routes.ts segment characters", () => {
    for (const [m, p, want] of [['GET', '/', 'GET /'], ['POST', '/computers/:id/start', 'POST /computers/{id}/start'], ['DELETE', '/api/v1/a.b~c@d-e_f/:keyName', 'DELETE /api/v1/a.b~c@d-e_f/{keyName}']] as const) {
      expect(routeLabel(m, p)).toBe(want);
      expect(errorInfo({ route: want }, { now }).route).toBe(want);
    }
    for (const bad of ['GET', 'GET /a b', 'GET /a?x=1', 'GET /a#b', 'GET /{Id}', 'GET //a', 'GET /a/', 'TRACE /a', 'GET /a/{id}x']) expect(errorInfo({ route: bad }, { now }).route).toBeNull();
  });

  it("reads a query.ts MutationResult's facts from its error, its outcome from the top", () => {
    const err = { kind: 'pending', pending: true, status: 503, code: null, traceId: '0123456789abcdef0123abcd', route: 'POST /a' };
    expect(errorInfo({ outcome: 'pending', error: err, idem: 'hub-k' }, { now })).toMatchObject({ outcome: 'pending', status: 503, traceId: '0123456789abcdef0123abcd', route: 'POST /a' });
    expect(errorInfo({ outcome: 'failed', error: { status: 422, code: 'VALIDATION_ERROR', message: 'No', route: 'PATCH /a/{id}' } }, { now })).toMatchObject({ outcome: 'failed', status: 422, code: 'VALIDATION_ERROR', message: null, route: 'PATCH /a/{id}' });
  });
});

describe('errorPage (the app registers a resolver; core keeps only the id)', () => {
  afterEach(() => { setPageResolver(null); });
  it('falls back to the plain id and no link with no resolver, an unknown id, a throw, or a link that is not in-app', () => {
    expect(errorPage('keys')).toEqual({ title: 'keys', href: null });
    setPageResolver({ title: (id) => (id === 'keys' ? 'SSH keys' : null), href: (id) => (id === 'keys' ? '#/keys' : null) });
    expect(errorPage('keys')).toEqual({ title: 'SSH keys', href: '#/keys' });
    expect(errorPage('other')).toEqual({ title: 'other', href: null });
    setPageResolver({ title: () => { throw new Error('x'); }, href: () => 'javascript:alert(1)' });
    expect(errorPage('keys')).toEqual({ title: 'keys', href: null });
    setPageResolver({ title: () => '  ', href: () => 'https://elsewhere' });
    expect(errorPage('keys')).toEqual({ title: 'keys', href: null });
    // a named page keeps only an in-app '#/' link
    for (const bad of ['javascript:alert(1)', 'https://elsewhere', '//elsewhere', '/auth/login', 'keys']) {
      setPageResolver({ title: () => 'SSH keys', href: () => bad });
      expect(errorPage('keys')).toEqual({ title: 'SSH keys', href: null });
    }
    // a title the resolver cannot give drops an otherwise good link too: the fallback is the id and no link
    for (const title of [() => null, () => '', () => { throw new Error('x'); }]) {
      setPageResolver({ title, href: () => '#/keys' });
      expect(errorPage('keys')).toEqual({ title: 'keys', href: null });
    }
  });
});

// The allow-list has no writer outside its module, and registration reads only the frozen declaration.
describe('errorInfo code allow-list boundaries', () => {
  it('exposes the published codes only as a check: no exported set another module can add a value to', () => {
    expect(Object.keys(genModule)).toEqual(['isPublishedCode']);
    for (const v of Object.values(genModule) as unknown[]) if (v instanceof Set) Set.prototype.add.call(v, 'ERRDETAILS_UNPUBLISHED');
    expect(errorInfo({ code: 'ERRDETAILS_UNPUBLISHED' }).code).toBeNull();
    const check = (genModule as Record<string, unknown>).isPublishedCode as (v: unknown) => boolean;
    expect(check('VALIDATION_ERROR')).toBe(true);
    expect(check('ERRDETAILS_UNPUBLISHED')).toBe(false);
    expect(check(42)).toBe(false);
  });

  it('registers the label the frozen route holds, never one a spec changes while it is declared', () => {
    const codes = ['VALIDATION_ERROR'] as string[] & { slice: () => string[] };
    const spec = { method: 'POST' as const, path: '/errdetails/stable', scope: 'base' as const, codes };
    codes.slice = () => { spec.path = '/errdetails/stable?value=ERRDETAILS_SYNTHETIC'; return Array.prototype.slice.call(codes) as string[]; };
    const r = defineRoute(spec);
    expect(r.path).toBe('/errdetails/stable');
    expect(errorInfo({ route: 'POST /errdetails/stable' }).route).toBe('POST /errdetails/stable');
    expect(errorInfo({ route: 'POST /errdetails/stable?value=ERRDETAILS_SYNTHETIC' }).route).toBeNull();
    // a getter is read once: the label is the value validated
    let reads = 0;
    const getterSpec = { method: 'POST' as const, scope: 'base' as const, get path() { reads += 1; return reads === 1 ? '/errdetails/getter' : '/errdetails/getter?value=ERRDETAILS_SYNTHETIC'; } };
    expect(defineRoute(getterSpec).path).toBe('/errdetails/getter');
    expect(errorInfo({ route: 'POST /errdetails/getter' }).route).toBe('POST /errdetails/getter');
    expect(errorInfo({ route: 'POST /errdetails/getter?value=ERRDETAILS_SYNTHETIC' }).route).toBeNull();
  });

  it('registers only the codes the frozen route holds, never what a codes array iterates or slices to', () => {
    const codes = ['VALIDATION_ERROR'] as string[];
    Object.defineProperty(codes, Symbol.iterator, { value: function* () { yield 'ERRDETAILS_ITERATED'; } });
    const r = defineRoute({ method: 'POST', path: '/errdetails/iterated', scope: 'base', codes });
    expect(r.codes).toEqual(['VALIDATION_ERROR']);
    expect(errorInfo({ code: 'ERRDETAILS_ITERATED' }).code).toBeNull();
    const sliced = ['ERRDETAILS_SLICED_OK'] as string[] & { slice: () => string[] };
    sliced.slice = () => ['ERRDETAILS_SLICED_OK', 'ERRDETAILS_NOT_VALIDATED'];
    expect(defineRoute({ method: 'POST', path: '/errdetails/sliced', scope: 'base', codes: sliced }).codes).toEqual(['ERRDETAILS_SLICED_OK']);
    expect(errorInfo({ code: 'ERRDETAILS_NOT_VALIDATED' }).code).toBeNull();
    // the same for query and body keys: the route holds the keys validated
    const q = ['a'] as string[] & { slice: () => string[] };
    q.slice = () => ['a', 'not a key'];
    expect(defineRoute({ method: 'GET', path: '/errdetails/query', scope: 'base', query: q }).query).toEqual(['a']);
  });

  it('copies a declared array by index into a plain array: no subclass, species or iterator of the caller survives', () => {
    class Codes extends Array<string> {}
    Object.defineProperty(Codes.prototype, Symbol.iterator, { value: function* () { yield 'ERRDETAILS_SPECIES'; } });
    Object.defineProperty(Codes.prototype, 'includes', { value: () => true });
    const r = defineRoute({ method: 'POST', path: '/errdetails/species', scope: 'base', codes: new Codes('VALIDATION_ERROR'), body: new Codes('a') });
    expect(Object.getPrototypeOf(r.codes)).toBe(Array.prototype);
    expect(Object.getPrototypeOf(r.body)).toBe(Array.prototype);
    expect(r.body?.includes('not_declared')).toBe(false);
    expect(errorInfo({ code: 'ERRDETAILS_SPECIES' }).code).toBeNull();
    // a plain array whose own constructor names another species
    class Other extends Array<string> {}
    Object.defineProperty(Other.prototype, Symbol.iterator, { value: function* () { yield 'ERRDETAILS_OWN_SPECIES'; } });
    const plain = ['VALIDATION_ERROR'];
    Object.defineProperty(plain, 'constructor', { value: { [Symbol.species]: Other } });
    const r2 = defineRoute({ method: 'POST', path: '/errdetails/own-species', scope: 'base', codes: plain });
    expect(Object.getPrototypeOf(r2.codes)).toBe(Array.prototype);
    expect(r2.codes).toEqual(['VALIDATION_ERROR']);
    expect(errorInfo({ code: 'ERRDETAILS_OWN_SPECIES' }).code).toBeNull();
  });

  it('keeps the fixed codes core\'s sources name and every run-open MESSAGES code', () => {
    const sources = import.meta.glob(
      ['./**/*.{ts,js}', '!./**/*.test.*', '!./test/**', '!./**/*.d.ts', '!./error-codes.gen.ts', '!./errors.ts'],
      { query: '?raw', import: 'default', eager: true },
    ) as Record<string, string>;
    // the literal alphabet is errors.ts's CODE: any code ErrorInfo could keep
    const L = "'[A-Za-z][A-Za-z0-9_.-]{0,63}'";
    // a literal compared (x === 'a', 'a' !== y) is read, not emitted
    const compared = new RegExp('[\\w.\\])]+\\s*[!=]==?\\s*' + L + '|' + L + '\\s*[!=]==?\\s*[\\w.(]+', 'g');
    const literals = (x: string): string[] => [...x.replace(compared, ' ').matchAll(new RegExp("'([A-Za-z][A-Za-z0-9_.-]{0,63})'", 'g'))].map((m) => m[1] as string);
    const exprOnly = new RegExp('^(?:' + L + '|[\\s|?:!]|[A-Za-z_.]+|===?)+$');
    const sites = [
      new RegExp('\\bcode\\??\\s*[:=]\\s*((?:' + L + '|[\\s|?:]|[A-Za-z_.]+(?:\\s*===?\\s*)?|!)+)', 'g'),
      new RegExp('\\brefused\\s*[:(]\\s*(' + L + ')', 'g'),
      new RegExp('\\bfail\\(\\s*(' + L + ')', 'g'),
      /type \w*(?:Code|Refusal)\w* = ([^;]+);/g,
      /function changesFit[^:]*\):\s*([^{]+)\{/g,
    ];
    // the text between the parentheses opening at s[i], quotes and nesting respected
    const inParens = (s: string, i: number): string => {
      let depth = 0;
      let q = '';
      for (let j = i; j < s.length; j++) {
        const ch = s.charAt(j);
        if (q) { if (ch === q && s.charAt(j - 1) !== '\\') q = ''; continue; }
        if (ch === "'" || ch === '"' || ch === '`') q = ch;
        else if (ch === '(') depth += 1;
        else if (ch === ')' && --depth === 0) return s.slice(i + 1, j);
      }
      return '';
    };
    const topLevel = (s: string): string[] => {
      const out: string[] = [];
      let depth = 0;
      let q = '';
      let cur = '';
      for (const ch of s) {
        if (q) { cur += ch; if (ch === q) q = ''; continue; }
        if (ch === "'" || ch === '"' || ch === '`') q = ch;
        else if ('([{<'.includes(ch)) depth += 1;
        else if (')]}>'.includes(ch)) depth -= 1;
        if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
      }
      out.push(cur);
      return out;
    };
    const typeofWords = new Set(['string', 'number', 'boolean', 'object', 'function', 'undefined', 'bigint', 'symbol']);
    const emitted = new Map<string, string>();
    const note = (c: string, where: string) => { if (!typeofWords.has(c)) emitted.set(c, where); };
    for (const [file, raw] of Object.entries(sources)) {
      const src = raw.replace(/\/\*[\s\S]*?\*\/|(?<![:'"])\/\/[^\n]*/g, '');
      for (const re of sites) for (const m of src.matchAll(re)) for (const c of literals(m[1] ?? '')) note(c, file);
      // every helper with a parameter named `code` (refused, refusal, fail, rejection, answeredRejection, …): the
      // literal its callers pass in that position
      const helpers = new Map<string, number>();
      for (const m of src.matchAll(/(?:function\s+(\w+)\s*\(|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(|^\s*(\w+)\s*\()/gm)) {
        const name = (m[1] ?? m[2] ?? m[3]) as string;
        if (['if', 'for', 'while', 'switch', 'catch', 'return', 'function'].includes(name)) continue;
        const params = topLevel(inParens(src, (m.index ?? 0) + m[0].length - 1)).map((p) => p.trim().split(/[?:=\s]/)[0]);
        if (params.includes('code')) helpers.set(name, params.indexOf('code'));
      }
      for (const [name, at] of helpers) {
        for (const m of src.matchAll(new RegExp('(?<![\\w.])' + name + '\\(', 'g'))) {
          const arg = (topLevel(inParens(src, (m.index ?? 0) + m[0].length - 1))[at] ?? '').trim();
          if (exprOnly.test(arg)) for (const c of literals(arg)) note(c, file + ' ' + name + '()');
        }
      }
    }
    // A guard, not a proof of completeness: the scan reads the code sites a pattern can see. Whoever adds a code core
    // emits adds it to CORE_CODES (errors.ts). It finds these sites (a scan that matches nothing passes vacuously):
    expect([
      'READ_BACK_FIRST', 'HOLDS_FULL', 'TOO_LARGE', 'ROUTE_QUERY', 'ROUTE_BODY', 'ROUTE_INVALID', 'ROUTE_NOT_ALLOWED', 'BUSY',
      'SCRUB_FAILED', 'ipv6', 'SCRUB_INVALID', 'NOT_JSON', 'OUT_OF_RANGE', 'needs_update', 'invalid_handle',
    ].filter((c) => !emitted.has(c))).toEqual([]);
    // compared literals are not taken for emitted ones
    expect(['answer', 'web', 'window', 'skipped'].filter((c) => emitted.has(c))).toEqual([]);
    const dropped = [...emitted].filter(([c]) => errorInfo({ code: c }).code !== c).map(([c, f]) => c + ' (' + f + ')');
    expect(dropped).toEqual([]);
    // and at run time: an actual core refusal keeps its code
    expect(errorInfo({ code: ipv4Problem('::1') }).code).toBe('ipv6');
    // run-open's results carry one key of its MESSAGES catalogue as `code` (run-open-core.js contract), some through
    // local variables the scan cannot follow (tracker_lost, other_user): every key is kept
    const runOpen = (globalThis as { HoodyRunOpenCore?: { MESSAGES: Record<string, string> } }).HoodyRunOpenCore;
    const keys = Object.keys(runOpen?.MESSAGES ?? {});
    expect(keys).toEqual(expect.arrayContaining(['needs_update', 'done', 'exited_error', 'tracker_lost', 'other_user']));
    expect(keys.filter((c) => errorInfo({ code: c }).code !== c)).toEqual([]);
  });
});

// The computer rename: hoody-agent answers computer_gone, computer_conflict and acp_computer_unsupported
// (its HTTP layer and its daemon), and the API answers COMPUTER_* codes. With no
// declared route to vouch for them, the published list alone keeps them; the spellings before the rename are no longer
// published by either, so they are dropped like any other unpublished code.
describe('errorInfo keeps the codes the renamed agent and API send', () => {
  it('keeps computer_* and COMPUTER_* on a 404 or 409 reply, and drops the spellings before the rename', () => {
    for (const [status, c] of [[404, 'computer_gone'], [409, 'computer_conflict'], [409, 'acp_computer_unsupported'], [409, 'COMPUTER_OPERATION_IN_PROGRESS'], [404, 'COMPUTER_NOT_FOUND']] as const) {
      expect(errorInfo({ status, code: c }, { now }).code, c).toBe(c);
    }
    for (const c of ['container_gone', 'container_conflict', 'acp_container_unsupported', 'CONTAINER_NOT_FOUND']) {
      expect(errorInfo({ status: 409, code: c }, { now }).code, c).toBeNull();
    }
  });

  // The list holds what a signed-in user can be answered with. A code that only the API's admin routes answer is
  // not in it, so it reads as no code here (a route that needs one declares it: routes.ts codes).
  it('keeps no code that only admin routes answer', () => {
    for (const [status, c] of [[400, 'CHALLENGE_QUERY_INVALID'], [503, 'CHALLENGE_EVIDENCE_UNAVAILABLE'], [404, 'SERVER_PRICING_NOT_FOUND']] as const) {
      expect(errorInfo({ status, code: c }, { now }).code, c).toBeNull();
    }
    for (const c of ['COMPUTER_EXPIRED', 'RATE_LIMITED', 'NO_PAID_CAPACITY_IN_REGION']) {
      expect(errorInfo({ status: 409, code: c }, { now }).code, c).toBe(c);
    }
  });
});
